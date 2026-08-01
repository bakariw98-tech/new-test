import { createHash } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import type { SizeName } from "./render";

/**
 * Rendered bytes must not travel back through the model — a 1080x1350 PNG is
 * megabytes, which is millions of characters as base64 and would consume the
 * caller's whole context for one slide. So a render returns a *reference* and
 * the bytes stay server-side.
 *
 * Two backends, picked automatically:
 *
 * - **Vercel Blob**, when BLOB_READ_WRITE_TOKEN is set. Short permanent CDN URL.
 *   This is the better answer and worth configuring.
 * - **Self-describing render URL**, otherwise. The markup is compressed into the
 *   query string, so GET on that URL re-renders the identical image. No storage,
 *   no credentials, nothing to provision — the URL *is* the artifact. Longer than
 *   a blob URL but still ~3 orders of magnitude smaller than the PNG.
 */

/** Query strings this long start running into proxy and browser limits. */
const MAX_ENCODED_LENGTH = 6000;

export function encodeMarkup(markup: string): string {
  return deflateRawSync(Buffer.from(markup, "utf8"), { level: 9 }).toString("base64url");
}

export function decodeMarkup(encoded: string): string {
  return inflateRawSync(Buffer.from(encoded, "base64url")).toString("utf8");
}

/**
 * The public origin for links we hand out. Vercel exposes the stable production
 * domain, which is what a downstream consumer should be fetching — not the
 * per-deployment URL.
 */
export function publicOrigin(): string {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return `https://${production}`;

  const deployment = process.env.VERCEL_URL;
  if (deployment) return `https://${deployment}`;

  return process.env.RENDER_ORIGIN ?? "http://localhost:3000";
}

export function selfDescribingUrl(params: {
  markup: string;
  size?: SizeName;
  width?: number;
  height?: number;
}): { url: string; tooLong: boolean } {
  const encoded = encodeMarkup(params.markup);
  const query = new URLSearchParams({ m: encoded });
  if (params.size) query.set("size", params.size);
  if (params.width) query.set("width", String(params.width));
  if (params.height) query.set("height", String(params.height));

  return {
    url: `${publicOrigin()}/api/render?${query.toString()}`,
    tooLong: encoded.length > MAX_ENCODED_LENGTH,
  };
}

export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Content-addressed so re-rendering the same markup reuses the same object
 * rather than piling up duplicates.
 */
export async function uploadToBlob(png: Uint8Array): Promise<string> {
  const { put } = await import("@vercel/blob");
  const body = Buffer.from(png);
  const digest = createHash("sha256").update(body).digest("hex").slice(0, 32);

  const result = await put(`renders/${digest}.png`, body, {
    access: "public",
    contentType: "image/png",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 31_536_000,
  });

  return result.url;
}
