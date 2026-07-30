import { renderToPng, SIZES, type SizeName } from "./render";
import { checkImageSources, explainRenderError, lintMarkup } from "./lint";

export const runtime = "nodejs";
export const maxDuration = 60;

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
