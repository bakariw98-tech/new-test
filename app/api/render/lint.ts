/**
 * Preflight checks on markup, so an agent gets a specific fix instead of a
 * generic Satori stack trace. Errors block the render; warnings do not.
 */

export type LintResult = { errors: string[]; warnings: string[] };

export function lintMarkup(markup: string): LintResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (/<style[\s>]/i.test(markup)) {
    errors.push(
      "Found a <style> block. Only inline `style` attributes are supported — move those declarations onto the elements themselves.",
    );
  }

  if (/\sclass(Name)?\s*=/i.test(markup)) {
    errors.push(
      "Found a class attribute. CSS selectors never apply here, so class-based styling is silently dropped. Use inline `style` attributes instead.",
    );
  }

  if (/display\s*:\s*grid|grid-template|grid-area/i.test(markup)) {
    errors.push(
      "Found CSS grid. Only flexbox is supported — rebuild the layout with nested `display: flex` rows and columns.",
    );
  }

  if (/<br\s*\/?>/i.test(markup)) {
    errors.push(
      "Found a <br> tag, which throws. For a line break use separate flex children in a column, or `white-space: pre-wrap` with a real newline in the text.",
    );
  }

  if (/position\s*:\s*(fixed|sticky)/i.test(markup)) {
    errors.push(
      "Found `position: fixed` or `position: sticky`, which are not supported. Use `position: absolute` inside a `position: relative` parent.",
    );
  }

  // Image sources must be absolute or inline; relative paths cannot resolve
  // server-side.
  for (const match of markup.matchAll(/<img[^>]*\ssrc\s*=\s*["']([^"']*)["']/gi)) {
    const src = match[1];
    if (!/^(https?:)?\/\//i.test(src) && !src.startsWith("data:")) {
      errors.push(
        `Image src "${src}" is not absolute. Use a full https:// URL or a data: URI — relative paths do not resolve.`,
      );
    }
  }

  for (const match of markup.matchAll(/background(?:-image)?\s*:[^;"']*url\(\s*['"]?([^'")]+)/gi)) {
    const src = match[1];
    if (!/^(https?:)?\/\//i.test(src) && !src.startsWith("data:")) {
      errors.push(
        `Background image url "${src}" is not absolute. Use a full https:// URL or a data: URI.`,
      );
    }
  }

  // The HTML width/height attributes are dropped on the way to Satori, so an
  // image sized only that way renders as nothing, with no error at all.
  for (const tag of markup.match(/<img[^>]*>/gi) ?? []) {
    const style = /\sstyle\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? "";
    const sizedInStyle = /(^|;)\s*width\s*:/i.test(style) && /(^|;)\s*height\s*:/i.test(style);
    if (!sizedInStyle) {
      const hasAttrs = /\swidth\s*=/i.test(tag);
      errors.push(
        hasAttrs
          ? "An <img> is sized with HTML width/height attributes. Those are ignored and the image will render as nothing. Move the dimensions into style, e.g. style=\"width:1080px;height:1350px\"."
          : "An <img> has no width and height in its style attribute, so it will render as nothing. Add style=\"width:...px;height:...px\".",
      );
    }
  }

  const fonts = new Set<string>();
  for (const match of markup.matchAll(/font-family\s*:\s*([^;"']+)/gi)) {
    const family = match[1].trim().replace(/['"]/g, "").split(",")[0].trim();
    if (family && family.toLowerCase() !== "inter") fonts.add(family);
  }
  if (fonts.size > 0) {
    warnings.push(
      `font-family ${[...fonts].map((f) => `"${f}"`).join(", ")} is not available and will silently fall back to Inter. Only Inter 400 and 700 are loaded.`,
    );
  }

  const weights = [...markup.matchAll(/font-weight\s*:\s*(\d{3})/gi)].map((m) => m[1]);
  const unsupported = [...new Set(weights.filter((w) => w !== "400" && w !== "700"))];
  if (unsupported.length > 0) {
    warnings.push(
      `font-weight ${unsupported.join(", ")} will snap to the nearest loaded weight. Only 400 and 700 exist — use those explicitly.`,
    );
  }

  const filters = [...markup.matchAll(/filter\s*:\s*([a-z-]+)\(/gi)].map((m) => m[1].toLowerCase());
  const supportedFilters = new Set([
    "blur",
    "brightness",
    "contrast",
    "grayscale",
    "invert",
    "saturate",
    "sepia",
  ]);
  const badFilters = [...new Set(filters.filter((f) => !supportedFilters.has(f)))];
  if (badFilters.length > 0) {
    warnings.push(
      `filter function(s) ${badFilters.join(", ")} are not supported and will be ignored. Supported: ${[...supportedFilters].join(", ")}.`,
    );
  }

  return { errors, warnings };
}

/**
 * A remote image that cannot be fetched does not fail the render — Satori just
 * omits it, so you get a plausible-looking image with a hole in it. Checking up
 * front turns that silent failure into a specific message.
 */
export async function checkImageSources(markup: string, timeoutMs = 5000): Promise<string[]> {
  const urls = new Set<string>();

  for (const match of markup.matchAll(/<img[^>]*\ssrc\s*=\s*["'](https?:\/\/[^"']+)["']/gi)) {
    urls.add(match[1]);
  }
  for (const match of markup.matchAll(
    /background(?:-image)?\s*:[^;"']*url\(\s*['"]?(https?:\/\/[^'")]+)/gi,
  )) {
    urls.add(match[1]);
  }

  const problems = await Promise.all(
    [...urls].map(async (url) => {
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: { Range: "bytes=0-0" },
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!response.ok && response.status !== 206) {
          return `Image URL ${url} returned HTTP ${response.status}. The render would silently omit it — use a reachable URL.`;
        }

        const type = response.headers.get("content-type") ?? "";
        if (type && !/^image\//i.test(type)) {
          return `Image URL ${url} served content-type "${type}" rather than an image. Satori cannot decode it and would omit it silently.`;
        }
        return null;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return `Image URL ${url} could not be fetched (${reason}). The render would succeed but omit the image.`;
      }
    }),
  );

  return problems.filter((p): p is string => p !== null);
}

/**
 * Satori's own errors are accurate but terse. Add the fix where we can
 * recognise the message.
 */
export function explainRenderError(message: string): string {
  if (/more than one child/i.test(message)) {
    return [
      message,
      "",
      "Fix: an element with two or more children must declare `display: flex` (or `display: none` / `display: contents`).",
      "Add `display:flex` to every container in your markup — including wrappers that only hold a heading and a paragraph.",
    ].join("\n");
  }

  if (/Invalid value for CSS property "display"/i.test(message)) {
    return [
      message,
      "",
      "Fix: only `flex`, `block`, `contents`, and `none` are valid. CSS grid is not supported — use nested flex rows and columns.",
    ].join("\n");
  }

  if (/Image size cannot be determined/i.test(message)) {
    return [
      message,
      "",
      "Fix: put the dimensions in the image's `style` attribute — style=\"width:1080px;height:1350px\".",
      "HTML width/height attributes are ignored here. This error also appears when the image URL could not be fetched at all, so check that it is reachable.",
    ].join("\n");
  }

  if (/Unsupported image type|Unable to fetch|fetch failed/i.test(message)) {
    return [
      message,
      "",
      "Fix: images must be reachable absolute https:// URLs or data: URIs, in a raster format Satori can decode (PNG, JPEG, GIF, SVG).",
    ].join("\n");
  }

  return message;
}
