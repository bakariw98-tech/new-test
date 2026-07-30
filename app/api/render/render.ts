import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { html as toVDom } from "satori-html";

/** Instagram-friendly presets, plus a couple of generic sizes. */
export const SIZES = {
  "ig-portrait": { width: 1080, height: 1350 }, // 4:5 — best feed real estate
  "ig-square": { width: 1080, height: 1080 },
  "ig-story": { width: 1080, height: 1920 },
  og: { width: 1200, height: 630 },
} as const;

export type SizeName = keyof typeof SIZES;

/**
 * Font families available to markup. Satori only knows what is loaded here, and
 * an unknown `font-family` falls back silently rather than erroring — so adding a
 * family means adding it to this list, not just naming it in the CSS.
 */
export const FONTS: Array<{ family: string; package: string; file: string; weight: 400 | 700 }> = [
  { family: "Inter", package: "inter", file: "inter-latin-400-normal.woff", weight: 400 },
  { family: "Inter", package: "inter", file: "inter-latin-700-normal.woff", weight: 700 },
  { family: "Poppins", package: "poppins", file: "poppins-latin-400-normal.woff", weight: 400 },
  { family: "Poppins", package: "poppins", file: "poppins-latin-700-normal.woff", weight: 700 },
  {
    family: "Playfair Display",
    package: "playfair-display",
    file: "playfair-display-latin-400-normal.woff",
    weight: 400,
  },
  {
    family: "Playfair Display",
    package: "playfair-display",
    file: "playfair-display-latin-700-normal.woff",
    weight: 700,
  },
  {
    family: "DM Serif Display",
    package: "dm-serif-display",
    file: "dm-serif-display-latin-400-normal.woff",
    weight: 400,
  },
];

export const FONT_FAMILIES = [...new Set(FONTS.map((f) => f.family))];

let fontCache: Array<{ name: string; data: Buffer; weight: 400 | 700; style: "normal" }> | null = null;

// Fonts come from the @fontsource/inter package rather than committed binaries.
// Read from disk rather than fetch(): Node's fetch does not support file:// URLs.
// Satori accepts ttf, otf, and woff — but not woff2, so use the .woff files.
// next.config.ts lists these under outputFileTracingIncludes, otherwise Next
// cannot trace a runtime path.join and they are missing from the deployed bundle.
const FONTSOURCE_DIR = path.join(process.cwd(), "node_modules", "@fontsource");

async function loadFonts() {
  if (fontCache) return fontCache;

  fontCache = await Promise.all(
    FONTS.map(async (font) => ({
      name: font.family,
      data: await readFile(path.join(FONTSOURCE_DIR, font.package, "files", font.file)),
      weight: font.weight,
      style: "normal" as const,
    })),
  );
  return fontCache;
}

export type RenderOptions = {
  /** HTML markup with inline `style` attributes. */
  markup: string;
  /** Named size preset. Ignored when width and height are both given. */
  size?: SizeName;
  width?: number;
  height?: number;
};

/**
 * Renders HTML markup to a PNG.
 *
 * Satori supports a CSS subset: flexbox (no grid), inline styles only (no
 * stylesheets or selectors), and `filter` limited to blur, brightness,
 * contrast, grayscale, invert, saturate, and sepia. Images need absolute URLs
 * or data URIs, and the root element must declare `display: flex`.
 */
export async function renderToPng(options: RenderOptions): Promise<Uint8Array> {
  const preset = SIZES[options.size ?? "ig-portrait"];
  const width = options.width ?? preset.width;
  const height = options.height ?? preset.height;

  // satori-html turns a markup string into the VDOM shape Satori consumes.
  // ImageResponse's types expect a ReactElement, but it forwards whatever it
  // gets straight to Satori, which accepts this tree.
  const tree = toVDom(options.markup) as unknown as React.ReactElement;

  const response = new ImageResponse(tree, {
    width,
    height,
    fonts: await loadFonts(),
  });

  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}
