import sharp from "sharp";
import { downloadFromDrive } from "../render/drive";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/image?src=<url>&w=&h=&fit=&fmt=
 *
 * Fetches a remote image and re-encodes it into something Satori can actually
 * decode. Satori handles PNG, JPEG, and GIF but *not* WebP or AVIF — and its
 * failure mode is unhelpful ("Image size cannot be determined"), so anything
 * modern needs normalising before it reaches a render.
 *
 * This also does the resizing, which matters for photos: a 4000px listing photo
 * scaled down by the renderer costs memory and time on every render, whereas
 * this response is immutably cached and reused.
 *
 * Also accepts Google Drive share links and rewrites them to a direct-content
 * URL, since that is where property photos usually live.
 */

const MAX_DIMENSION = 4096;
const FETCH_TIMEOUT_MS = 20_000;

/** Drive share URLs are HTML pages; the file ID maps to a direct-content host. */
function normaliseSource(raw: string): string {
  const drive =
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/.exec(raw) ??
    /drive\.google\.com\/(?:uc|open)\?(?:[^&]*&)*id=([a-zA-Z0-9_-]+)/.exec(raw);

  return drive ? `https://lh3.googleusercontent.com/d/${drive[1]}` : raw;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const rawSrc = params.get("src");
  const driveId = params.get("drive");

  // A file uploaded through /api/upload is readable with the server's own
  // credentials, so it never has to be shared publicly.
  if (driveId) {
    try {
      const { bytes } = await downloadFromDrive(driveId);
      return convert(bytes, params);
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Could not read that Drive file." },
        { status: 502 },
      );
    }
  }

  if (!rawSrc) {
    return Response.json(
      { error: "Missing `src` (a public image URL) or `drive` (a file ID from /api/upload)." },
      { status: 400 },
    );
  }

  let source: URL;
  try {
    source = new URL(normaliseSource(rawSrc));
  } catch {
    return Response.json({ error: "`src` must be an absolute URL." }, { status: 400 });
  }

  if (source.protocol !== "https:" && source.protocol !== "http:") {
    return Response.json({ error: "`src` must be an http(s) URL." }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(source, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (error) {
    return Response.json(
      {
        error: `Could not fetch ${source.href} (${error instanceof Error ? error.message : "unknown error"}).`,
        hint: "For Google Drive, the file must be shared so anyone with the link can view it — a private file is not fetchable by this server.",
      },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    return Response.json(
      {
        error: `Source returned HTTP ${upstream.status}.`,
        hint: "A Google Drive link that returns 403 or 404 here is almost always still private. Share it with 'Anyone with the link'.",
      },
      { status: 502 },
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (contentType.startsWith("text/html")) {
    return Response.json(
      {
        error: "Source returned an HTML page rather than image bytes.",
        hint: "This is what a private or interstitial Google Drive link looks like. Make the file link-viewable and try again.",
      },
      { status: 502 },
    );
  }

  const input = Buffer.from(await upstream.arrayBuffer());
  return convert(input, params);
}

/** Re-encode to something Satori can decode, and optionally resize. */
async function convert(input: Uint8Array, params: URLSearchParams): Promise<Response> {
  const width = clampDimension(params.get("w"));
  const height = clampDimension(params.get("h"));
  const fit = parseFit(params.get("fit"));
  const format = params.get("fmt") === "png" ? "png" : "jpeg";

  try {
    let pipeline = sharp(Buffer.from(input), { failOn: "none" }).rotate();

    if (width || height) {
      pipeline = pipeline.resize({ width, height, fit, withoutEnlargement: false });
    }

    const output =
      format === "png"
        ? await pipeline.png().toBuffer()
        : await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer();

    // Body must be a plain, zero-offset Uint8Array. A Node Buffer is not a
    // recognised BodyInit, and neither is a Uint8Array view carrying a byte
    // offset over sharp's pooled ArrayBuffer — in both cases Response falls back
    // to stringifying, and the endpoint returns HTTP 200 with the correct
    // content-type while the payload is the bytes rendered as text
    // ("255,216,255,..."). Copying into a fresh array is what /api/render does,
    // and it is the only form that survives both local Node and Vercel.
    const body = new Uint8Array(output.byteLength);
    body.set(output);

    return new Response(body, {
      headers: {
        "Content-Type": format === "png" ? "image/png" : "image/jpeg",
        "Content-Length": String(body.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: `Could not decode or convert the image (${error instanceof Error ? error.message : "unknown error"}).`,
      },
      { status: 422 },
    );
  }
}

const FITS = ["cover", "contain", "fill", "inside", "outside"] as const;
type Fit = (typeof FITS)[number];

function parseFit(value: string | null): Fit {
  return FITS.includes(value as Fit) ? (value as Fit) : "cover";
}

function clampDimension(value: string | null): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.min(Math.round(parsed), MAX_DIMENSION);
}
