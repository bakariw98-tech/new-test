import { JWT, OAuth2Client } from "google-auth-library";
import { googleRefreshToken } from "../../../lib/store/credentials";

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
 * Scopes:
 *
 * - `drive.file` — create files and manage the ones this app created. Nothing
 *   else in the account is visible.
 * - `drive.readonly` — read anything the account can read. This is what makes
 *   "point at a folder of listing photos" work, because a folder the agent
 *   filled themselves is invisible under drive.file alone.
 *
 * `drive.readonly` is a **restricted** scope. It works immediately for the
 * project's own owner and its test users, but shipping it to real customers
 * requires Google's CASA third-party security assessment — an annual cost and a
 * multi-week review. The narrower alternative is the Google Picker, which grants
 * per-file access under drive.file and needs no assessment.
 *
 * Both scopes are requested together: the server still creates and deletes its
 * own renders, and additionally reads folders the agent points it at. A token
 * minted for drive.file alone keeps working for everything except folder reads.
 */

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
];

const SCOPE = SCOPES.join(" ");

export type DriveUpload = {
  fileId: string;
  name: string;
  webViewLink: string;
};

/**
 * Which credential path is available. The refresh token is deliberately not
 * checked here: it can arrive either from the environment or from a Drive
 * connected at runtime through /api/google/connect, and this has to stay
 * synchronous for the callers that gate on it. `accessToken()` reports a
 * missing token with instructions.
 */
export function driveMode(): "oauth" | "service-account" | null {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return "oauth";
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) return "service-account";
  return null;
}

export const DRIVE_SETUP_HINT = [
  "Google Drive delivery is not configured on this deployment. Set either:",
  "  - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN (user OAuth — required for personal Gmail accounts), or",
  "  - GOOGLE_SERVICE_ACCOUNT_KEY (the service-account JSON key — only works with a Shared Drive).",
  "No folder configuration is required: pass driveFolder to have folders created on demand.",
  "GOOGLE_DRIVE_FOLDER_ID is optional and only sets the root those folders are created under.",
].join("\n");

async function accessToken(): Promise<string> {
  const mode = driveMode();

  if (mode === "oauth") {
    const client = new OAuth2Client({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    });
    // A Drive connected through /api/google/connect wins over whatever was set
    // in the environment, so reconnecting actually takes effect.
    const refreshToken = await googleRefreshToken();
    if (!refreshToken) {
      throw new Error(
        "No Google account is connected. Visit /api/google/connect to connect one, or set GOOGLE_REFRESH_TOKEN.",
      );
    }
    client.setCredentials({ refresh_token: refreshToken });
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

const FOLDER_MIME = "application/vnd.google-apps.folder";

function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findFolder(token: string, name: string, parentId: string): Promise<string | null> {
  const q = [
    `mimeType = '${FOLDER_MIME}'`,
    `name = '${escapeQueryValue(name)}'`,
    `'${escapeQueryValue(parentId)}' in parents`,
    "trashed = false",
  ].join(" and ");

  const url =
    "https://www.googleapis.com/drive/v3/files" +
    `?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1` +
    "&supportsAllDrives=true&includeItemsFromAllDrives=true";

  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(explainDriveError(response.status, await response.text()));

  const { files } = (await response.json()) as { files: Array<{ id: string }> };
  return files.length > 0 ? files[0].id : null;
}

async function createFolder(token: string, name: string, parentId: string): Promise<string> {
  const response = await fetch(
    "https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
    },
  );
  if (!response.ok) throw new Error(explainDriveError(response.status, await response.text()));

  const { id } = (await response.json()) as { id: string };
  return id;
}

/**
 * Resolves a slash-separated folder path, creating any segment that does not
 * exist yet — so a caller can just say "412 Birchwood Lane/2026-07" and get a
 * folder, rather than having to provision one up front and carry its ID around.
 *
 * Note the scope boundary: with drive.file the server only sees files it created,
 * so this finds and reuses folders *it* made. It will not silently adopt an
 * unrelated folder of the same name that already existed in the account. To
 * deliver into a folder someone else created, pass its ID explicitly instead.
 */
export async function ensureFolderPath(path: string, rootId?: string): Promise<string> {
  const token = await accessToken();
  const segments = path
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);

  let parent = rootId ?? process.env.GOOGLE_DRIVE_FOLDER_ID ?? "root";
  for (const segment of segments) {
    parent = (await findFolder(token, segment, parent)) ?? (await createFolder(token, segment, parent));
  }
  return parent;
}

export type DrivePhoto = {
  fileId: string;
  name: string;
  mimeType: string;
  width: number | null;
  height: number | null;
};

/**
 * Pulls a folder ID out of whatever the agent pasted — a full Drive URL, a
 * "shared with me" link, or the bare ID. Anyone copying a folder from Drive gets
 * a URL, not an ID, and asking them to extract it by hand is the opposite of one
 * click.
 */
export function parseDriveFolderId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]{10,})/, // .../drive/folders/<id>
    /\/drive\/u\/\d+\/folders\/([a-zA-Z0-9_-]{10,})/,
    /[?&]id=([a-zA-Z0-9_-]{10,})/, // ...open?id=<id>
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(value);
    if (match) return match[1];
  }
  // A bare ID, but not a URL we failed to understand.
  return /^[a-zA-Z0-9_-]{10,}$/.test(value) ? value : null;
}

/**
 * Every image in a folder, in the order the agent named them.
 *
 * Needs `drive.readonly`: a folder the agent filled themselves was not created
 * by this app, so `drive.file` cannot see it or anything inside it.
 *
 * Sorted by filename rather than by upload time, because listing photos are
 * conventionally named for their running order (01-exterior, 02-living), and
 * upload order is whatever the finder happened to do.
 */
export async function listFolderImages(folderId: string): Promise<DrivePhoto[]> {
  const token = await accessToken();
  const photos: DrivePhoto[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${escapeQueryValue(folderId)}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, imageMediaMetadata(width, height))",
      pageSize: "200",
      orderBy: "name_natural",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(explainDriveError(response.status, await response.text()));
    }

    const body = (await response.json()) as {
      nextPageToken?: string;
      files: Array<{
        id: string;
        name: string;
        mimeType: string;
        imageMediaMetadata?: { width?: number; height?: number };
      }>;
    };

    for (const file of body.files) {
      photos.push({
        fileId: file.id,
        name: file.name,
        mimeType: file.mimeType,
        width: file.imageMediaMetadata?.width ?? null,
        height: file.imageMediaMetadata?.height ?? null,
      });
    }
    pageToken = body.nextPageToken;
  } while (pageToken);

  return photos;
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

/**
 * Reads a file back out of Drive using the server's own credentials.
 *
 * This works precisely because `drive.file` grants access to files the app
 * created — so anything uploaded through here can be fetched again later,
 * without the file ever being made public. It cannot read anything else in the
 * account, which is the property that makes this safe to point at a client's
 * Drive.
 */
export async function downloadFromDrive(
  fileId: string,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const token = await accessToken();

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? `Drive has no file ${fileId} that this server created. Only files uploaded through this server can be read back — a file the account owns but the app did not create is not visible under drive.file scope.`
        : explainDriveError(response.status, await response.text()),
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);

  return { bytes, mimeType: response.headers.get("content-type") ?? "application/octet-stream" };
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
