import { JWT, OAuth2Client } from "google-auth-library";

/**
 * Delivers finished renders straight into Google Drive.
 *
 * The upload happens server-to-server. An agent asking for a render never holds
 * the PNG — it gets a Drive link back — which is what makes "render it, it's in
 * the client's Drive, delete it if you don't like it" a fast loop rather than a
 * context-destroying one.
 *
 * Two credential modes, because which one works depends on the account:
 *
 * - **User OAuth** (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN).
 *   Files are owned by that user and count against their quota. This is the mode
 *   that works for a personal Gmail account.
 * - **Service account** (GOOGLE_SERVICE_ACCOUNT_KEY, the JSON key). Simpler to
 *   rotate, but a service account has no storage quota of its own, so it can only
 *   write into a **Shared Drive** — a Workspace feature. Writing into a personal
 *   My Drive folder fails with "Service Accounts do not have storage quota",
 *   even when the folder is shared with it.
 *
 * Scope is drive.file: the server can create files and manage the ones it
 * created, and can touch nothing else in the account.
 */

const SCOPE = "https://www.googleapis.com/auth/drive.file";

export type DriveUpload = {
  fileId: string;
  name: string;
  webViewLink: string;
};

export function driveMode(): "oauth" | "service-account" | null {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) {
    return "oauth";
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) return "service-account";
  return null;
}

export const DRIVE_SETUP_HINT = [
  "Google Drive delivery is not configured on this deployment. Set either:",
  "  - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN (user OAuth — required for personal Gmail accounts), or",
  "  - GOOGLE_SERVICE_ACCOUNT_KEY (the service-account JSON key — only works with a Shared Drive).",
  "Optionally set GOOGLE_DRIVE_FOLDER_ID to give uploads a default destination folder.",
].join("\n");

async function accessToken(): Promise<string> {
  const mode = driveMode();

  if (mode === "oauth") {
    const client = new OAuth2Client({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    });
    client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const { token } = await client.getAccessToken();
    if (!token) throw new Error("Google refused to issue an access token for the stored refresh token.");
    return token;
  }

  if (mode === "service-account") {
    const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY as string) as {
      client_email: string;
      private_key: string;
    };
    const jwt = new JWT({ email: key.client_email, key: key.private_key, scopes: [SCOPE] });
    const { access_token: token } = await jwt.authorize();
    if (!token) throw new Error("The service account key did not yield an access token.");
    return token;
  }

  throw new Error(DRIVE_SETUP_HINT);
}

/** Drive rejects a quoted boundary, so keep this to boundary-safe characters. */
function makeBoundary(): string {
  return `render${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export async function uploadToDrive(params: {
  bytes: Uint8Array;
  name: string;
  mimeType?: string;
  folderId?: string;
}): Promise<DriveUpload> {
  const token = await accessToken();
  const mimeType = params.mimeType ?? "image/png";
  const folderId = params.folderId ?? process.env.GOOGLE_DRIVE_FOLDER_ID;

  const metadata: Record<string, unknown> = { name: params.name, mimeType };
  if (folderId) metadata.parents = [folderId];

  const boundary = makeBoundary();
  const head = Buffer.from(
    `--${boundary}\r\n` +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);

  // Same lesson as /api/image: hand fetch a plain zero-offset Uint8Array, or the
  // body gets stringified and Drive stores the bytes rendered as text.
  const joined = Buffer.concat([head, Buffer.from(params.bytes), tail]);
  const body = new Uint8Array(joined.byteLength);
  body.set(joined);

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(explainDriveError(response.status, detail));
  }

  const file = (await response.json()) as { id: string; name: string; webViewLink?: string };
  return {
    fileId: file.id,
    name: file.name,
    webViewLink: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`,
  };
}

export async function deleteFromDrive(fileId: string): Promise<void> {
  const token = await accessToken();
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );

  // 404 means it is already gone, which is the outcome the caller wanted.
  if (!response.ok && response.status !== 404) {
    throw new Error(explainDriveError(response.status, await response.text()));
  }
}

function explainDriveError(status: number, detail: string): string {
  if (/storage quota/i.test(detail)) {
    return [
      "Drive rejected the upload: service accounts have no storage quota of their own.",
      "A service account can only write into a Shared Drive (a Workspace feature), not a personal My Drive folder — sharing the folder with it is not enough.",
      "For a personal Gmail account, switch to user OAuth: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN.",
    ].join("\n");
  }

  if (status === 404) {
    return "Drive returned 404 for the destination folder. Check GOOGLE_DRIVE_FOLDER_ID, and that the configured account can actually see that folder.";
  }

  if (status === 403) {
    return `Drive refused the request (403). The account likely lacks write access to the destination folder, or the Drive API is not enabled on the project.\n${detail.slice(0, 400)}`;
  }

  if (status === 401) {
    return "Drive rejected the credentials (401). The refresh token may have been revoked, or the service-account key rotated.";
  }

  return `Drive upload failed with HTTP ${status}. ${detail.slice(0, 400)}`;
}
