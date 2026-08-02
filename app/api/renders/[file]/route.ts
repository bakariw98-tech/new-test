import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

/**
 * Serves renders written to disk when Blob is not configured.
 *
 * Only reachable in that mode — with Blob, `uploadRender` returns a CDN URL and
 * nothing points here.
 */

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;

  // Content-addressed names only. Anything else is either a mistake or an
  // attempt to walk out of the directory.
  if (!/^[a-f0-9]{32}\.(mp4|png|jpg)$/.test(file)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const bytes = await readFile(path.join(process.cwd(), ".renders", file));
    // A fresh zero-offset copy — a Buffer view makes Response stringify the
    // payload and serve digits as text with a 200.
    const body = new Uint8Array(bytes.byteLength);
    body.set(bytes);

    return new Response(body, {
      headers: {
        "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
        "Content-Length": String(body.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
