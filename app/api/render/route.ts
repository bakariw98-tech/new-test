import { renderToPng, SIZES, type SizeName } from "./render";

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
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Render failed." },
      { status: 422 },
    );
  }
}
