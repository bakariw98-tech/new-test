/**
 * Turns a theme plus an account's branding into absolute values for one medium.
 *
 * This is the only place a brand profile is allowed to influence design. An
 * account can override the accent colour and the fonts — everything else stays
 * on the theme, which is what keeps a customer's assets looking designed rather
 * than looking like a template builder handed them a colour picker.
 */

import type { BrandProfile, FontKey, ResolvedTheme, ThemeId } from "../core/types";
import { BASE_UNIT, type Medium, THEMES } from "./tokens";

/** Fonts actually loaded by the renderer. See FONTS in app/api/render/render.ts. */
const AVAILABLE_FONTS: readonly FontKey[] = [
  "Inter",
  "Poppins",
  "Playfair Display",
  "DM Serif Display",
];

/** DM Serif Display ships 400 only — asking for 700 silently snaps back to it. */
const WEIGHT_400_ONLY: readonly FontKey[] = ["DM Serif Display"];

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export type ResolveOptions = {
  themeId: ThemeId;
  brand?: Pick<BrandProfile, "accentColor" | "headingFont" | "bodyFont"> | null;
  medium: Medium;
  /** Overrides the medium's default base unit. Rarely needed. */
  baseUnit?: number;
};

export function resolveTheme(options: ResolveOptions): ResolvedTheme {
  const theme = THEMES[options.themeId];
  const base = options.baseUnit ?? BASE_UNIT[options.medium];
  const brand = options.brand ?? null;

  const accent = validHex(brand?.accentColor) ? brand!.accentColor! : theme.color.accent;
  const heading = validFont(brand?.headingFont) ? brand!.headingFont! : theme.font.heading;
  const body = validFont(brand?.bodyFont) ? brand!.bodyFont! : theme.font.body;

  // A custom accent changes what is readable on top of it. Recomputing rather
  // than keeping the theme's `onAccent` is the difference between a legible
  // price chip and white-on-yellow.
  const onAccent =
    accent === theme.color.accent ? theme.color.onAccent : readableInkOn(accent, theme);

  return {
    id: theme.id,
    color: { ...theme.color, accent, onAccent },
    font: {
      heading,
      body,
      headingWeight: WEIGHT_400_ONLY.includes(heading) ? 400 : theme.font.headingWeight,
    },
    size: {
      display: round(theme.scale.display * base),
      h1: round(theme.scale.h1 * base),
      h2: round(theme.scale.h2 * base),
      body: round(theme.scale.body * base),
      caption: round(theme.scale.caption * base),
      micro: round(theme.scale.micro * base),
    },
    space: theme.space.map((step) => round(step * base)),
    // A pill stays a pill at any size; a card radius scales with the medium.
    radius: { pill: theme.radius.pill, card: round(theme.radius.card * base) },
    motif: theme.motif,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function validHex(value: string | null | undefined): boolean {
  return typeof value === "string" && HEX.test(value);
}

function validFont(value: string | null | undefined): boolean {
  return typeof value === "string" && AVAILABLE_FONTS.includes(value as FontKey);
}

/**
 * Relative luminance per WCAG 2.x. Used to decide whether text sitting on the
 * brand's accent colour should be the theme's light or dark ink.
 */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/** Whichever of the theme's two inks is more readable on `background`. */
function readableInkOn(background: string, theme: (typeof THEMES)[ThemeId]): string {
  const candidates = [theme.color.ink, theme.color.bg, "#FFFFFF", "#1A1A1A"];
  let best = candidates[0];
  let bestRatio = 0;
  for (const candidate of candidates) {
    const ratio = contrastRatio(background, candidate);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = candidate;
    }
  }
  return best;
}

function parseHex(hex: string): [number, number, number] {
  let value = hex.replace("#", "");
  if (value.length === 3) {
    value = value
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}
