/**
 * Where a connected Google account's refresh token lives.
 *
 * Stored as a **private** Blob object. Public blobs are readable by anyone who
 * knows the URL, which is fine for listing JSON that is about to be published
 * and completely unacceptable for a credential.
 *
 * There is one record because there is one account. When accounts land, this
 * becomes a row keyed on account_id and only the path changes — nothing that
 * calls `googleRefreshToken()` needs to know.
 */

import { blobConfigured } from "../../app/api/render/store";

const PATH = "credentials/google.json";

export type GoogleCredential = {
  refreshToken: string;
  scope: string;
  email: string | null;
  connectedAt: string;
};

export async function saveGoogleCredential(credential: GoogleCredential): Promise<void> {
  if (!blobConfigured()) {
    throw new Error(
      "Cannot store the Google connection: BLOB_READ_WRITE_TOKEN is not set on this deployment.",
    );
  }
  const { put } = await import("@vercel/blob");
  await put(PATH, JSON.stringify(credential), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
}

export async function loadGoogleCredential(): Promise<GoogleCredential | null> {
  if (!blobConfigured()) return null;
  try {
    const { get } = await import("@vercel/blob");
    const result = await get(PATH, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return (await new Response(result.stream).json()) as GoogleCredential;
  } catch {
    // A missing credential is the normal state before anyone has connected.
    return null;
  }
}

export async function clearGoogleCredential(): Promise<void> {
  if (!blobConfigured()) return;
  const { del } = await import("@vercel/blob");
  try {
    await del(PATH);
  } catch {
    // Already gone is the desired end state.
  }
}

/**
 * The refresh token to use, preferring one connected through the OAuth flow
 * over the deployment-wide environment variable. That order matters: connecting
 * a Drive in the browser has to win over whatever was pasted into Vercel
 * months ago, or reconnecting would appear to do nothing.
 */
export async function googleRefreshToken(): Promise<string | null> {
  const connected = await loadGoogleCredential();
  return connected?.refreshToken ?? process.env.GOOGLE_REFRESH_TOKEN ?? null;
}
