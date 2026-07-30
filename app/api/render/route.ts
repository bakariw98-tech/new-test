import { renderToPng, SIZES, type SizeName } from "./render";
import { checkImageSources, explainRenderError, lintMarkup } from "./lint";
import { decodeMarkup } from "./store";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/render?m=<compressed markup>&size=...
 *
 * Resolves the self-describing URLs handed out by render_image. The query string
 * fully determines the bytes, so the response is immutably cacheable and the CDN
 * serves repeats for free.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const encoded = params.get("m");

  if (!encoded) {
    return Response.json(
      { error: "Missing `m` parameter. GET /api/render expects a compressed markup payload, which render_image produces — POST JSON here instead if you have raw markup." },
      { status: 400 },
    );
  }

  let markup: string;
  try {
    markup = decodeMarkup(encoded);
  } catch {
    return Response.json({ error: "`m` is not a valid compressed markup payload." }, { status: 400 });
  }

  const size = params.get("size");
  const width = Number(params.get("width")) || undefined;
  const height = Number(params.get("height")) || undefined;

  if (size !== null && !(size in SIZES)) {
    return Response.json(
      { error: `\`size\` must be one of: ${Object.keys(SIZES).join(", ")}.` },
      { status: 400 },
    );
  }

  try {
    const png = await renderToPng({
      markup,
      size: (size as SizeName | null) ?? undefined,
      width,
      height,
    });

    return new Response(png as unknown as BodyInit, {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(png.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return Response.json(
      { error: explainRenderError(error instanceof Error ? error.message : "Render failed.") },
      { status: 422 },
    );
  }
}

/**
 * POST /api/render
 *
 * Body: { markup: string, size?: SizeName, width?: number, height?: number }
 * Returns: image/png
 *
 * Useful for piping straight to a file:
 *   curl -X POST .../api/render -d '{"markup":"..."}' -o slide.png
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const { markup, size, width, height } = (body ?? {}) as {
    markup?: unknown;
    size?: unknown;
    width?: unknown;
    height?: unknown;
  };

  if (typeof markup !== "string" || markup.trim() === "") {
    return Response.json({ error: "`markup` is required and must be a non-empty string." }, { status: 400 });
  }

  if (size !== undefined && !(typeof size === "string" && size in SIZES)) {
    return Response.json(
      { error: `\`size\` must be one of: ${Object.keys(SIZES).join(", ")}.` },
      { status: 400 },
    );
  }

  const { errors, warnings } = lintMarkup(markup);
  if (errors.length === 0) errors.push(...(await checkImageSources(markup)));
  if (errors.length > 0) {
    return Response.json({ error: "Invalid markup.", problems: errors }, { status: 400 });
  }

  try {
    const png = await renderToPng({
      markup,
      size: size as SizeName | undefined,
      width: typeof width === "number" ? width : undefined,
      height: typeof height === "number" ? height : undefined,
    });

    return new Response(png as unknown as BodyInit, {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(png.byteLength),
        "Cache-Control": "no-store",
        // Warning text is non-ASCII, and header values must be latin-1, so the
        // count goes in the header and the text is reported via MCP instead.
        ...(warnings.length > 0 ? { "X-Render-Warning-Count": String(warnings.length) } : {}),
      },
    });
  } catch (error) {
    return Response.json(
      { error: explainRenderError(error instanceof Error ? error.message : "Render failed.") },
      { status: 422 },
    );
  }
}
