/**
 * Where a connected Google account's refresh token lives.
 *
 * The token is **encrypted before it is stored**, with AES-256-GCM. The first
 * version relied on Vercel Blob's private access instead, which fails outright
 * on a store provisioned as public — and "reconfigure your Blob store" is a bad
 * thing to require of someone trying to connect their Drive. Encrypting means
 * the storage backend's access model stops mattering: a public object holding
 * ciphertext is not a credential leak.
 *
 * The key comes from CREDENTIAL_SECRET, falling back to GOOGLE_CLIENT_SECRET so
 * there is nothing extra to provision. Rotating whichever one is in use makes
 * stored credentials unreadable — the connection is simply dropped and has to be
 * made again, which is a one-click flow, not a data loss.
 *
 * There is one record because there is one account. When accounts land, this
 * becomes a row keyed on account_id and only the path changes.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { blobConfigured } from "../../app/api/render/store";

const PATH = "credentials/google.json";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
/** Fixed salt: the key material is already secret, and a stored random salt
 *  would have to live beside the ciphertext anyway. */
const SALT = "listing-platform:google-credential:v1";

export type GoogleCredential = {
  refreshToken: string;
  scope: string;
  email: string | null;
  connectedAt: string;
};

/** What actually lands in storage — no plaintext secret anywhere in it. */
type SealedCredential = {
  v: 1;
  sealed: string;
  scope: string;
  email: string | null;
  connectedAt: string;
};

function key(): Buffer {
  const secret = process.env.CREDENTIAL_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) {
    throw new Error(
      "Cannot store the Google connection: set CREDENTIAL_SECRET (or GOOGLE_CLIENT_SECRET) so the refresh token can be encrypted.",
    );
  }
  return scryptSync(secret, SALT, 32);
}

function seal(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

function unseal(sealed: string): string {
  const raw = Buffer.from(sealed, "base64");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + 16);
  const decipher = createDecipheriv(ALGORITHM, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + 16)), decipher.final()]).toString(
    "utf8",
  );
}

export async function saveGoogleCredential(credential: GoogleCredential): Promise<void> {
  if (!blobConfigured()) {
    throw new Error(
      "Cannot store the Google connection: BLOB_READ_WRITE_TOKEN is not set on this deployment.",
    );
  }
  const sealed: SealedCredential = {
    v: 1,
    sealed: seal(credential.refreshToken),
    scope: credential.scope,
    email: credential.email,
    connectedAt: credential.connectedAt,
  };

  const { put } = await import("@vercel/blob");
  await put(PATH, JSON.stringify(sealed), {
    access: "public",
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
    const result = await get(PATH, { access: "public", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;

    const stored = (await new Response(result.stream).json()) as SealedCredential;
    if (stored?.v !== 1 || typeof stored.sealed !== "string") return null;

    return {
      refreshToken: unseal(stored.sealed),
      scope: stored.scope ?? "",
      email: stored.email ?? null,
      connectedAt: stored.connectedAt,
    };
  } catch {
    // No credential yet, or the key changed and the ciphertext no longer opens.
    // Both mean "not connected", and reconnecting fixes both.
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
 * over the deployment-wide environment variable. That order matters:
 * reconnecting has to win over whatever was pasted into Vercel months ago, or
 * it would appear to do nothing.
 */
export async function googleRefreshToken(): Promise<string | null> {
  const connected = await loadGoogleCredential();
  return connected?.refreshToken ?? process.env.GOOGLE_REFRESH_TOKEN ?? null;
}
