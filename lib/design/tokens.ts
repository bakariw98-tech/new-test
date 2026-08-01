/**
 * The single source of visual truth.
 *
 * Three media consume these: the carousel is a fixed 1080x1350 canvas, the
 * website is fluid, and the PDF is 8.5x11in. A colour is a colour everywhere,
 * but a 56px heading is enormous on a phone and invisible on a flyer — so the
 * type scale and spacing are stored as **ratios of a base unit**, and each
 * medium resolves them against its own base.
 *
 *   carousel  base 36px  -> h1 63px
 *   website   base 17px  -> h1 30px
 *   print     base 11pt  -> h1 19pt
 *
 * Same proportions, different absolute sizes. That is the mechanism that makes
 * a flyer and an Instagram post look like the same product rather than two
 * things that happen to share a logo. Nothing else in the codebase may define a
 * colour or a font size.
 */

import type { FontKey, ResolvedTheme, ThemeId } from "../core/types";

/** Base unit per medium. Everything else is a multiple of these. */
export const BASE_UNIT = {
  carousel: 36,
  website: 17,
  print: 11,
} as const;

export type Medium = keyof typeof BASE_UNIT;

export type Theme = {
  id: ThemeId;
  label: string;
  color: ResolvedTheme["color"];
  font: { heading: FontKey; body: FontKey; headingWeight: 400 | 700 };
  /** Multiples of the base unit. */
  scale: { display: number; h1: number; h2: number; body: number; caption: number; micro: number };
  /** Multiples of the base unit. Index into this, do not invent spacing. */
  space: number[];
  /** `pill` is absolute (a pill is a pill at any size); `card` is a multiple. */
  radius: { pill: number; card: number };
  /**
   * The geometry personality — how a photo meets a panel.
   * `curve` sweeps on a Bezier, `rule` uses a thin accent line, `none` butts
   * them flat. This is what stops three themes from being three palettes.
   */
  motif: "curve" | "rule" | "none";
};

/**
 * One scale, all three themes. Derived from the sizes that were already
 * rendering well on the carousel at base 36: body 36, h1 63, caption 30.
 */
const SCALE = {
  display: 2.6,
  h1: 1.75,
  h2: 1.35,
  body: 1.0,
  caption: 0.85,
  micro: 0.72,
} as const;

const SPACE = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

export const THEMES: Record<ThemeId, Theme> = {
  /** Was the `midnight` preset. Deep navy, gold accent, geometric sans. */
  modern: {
    id: "modern",
    label: "Modern",
    color: {
      bg: "#101828",
      surface: "#1B2436",
      ink: "#FFFFFF",
      inkMuted: "#9BA3C0",
      accent: "#F5B841",
      onAccent: "#101828",
      line: "#3A4360",
    },
    font: { heading: "Inter", body: "Inter", headingWeight: 700 },
    scale: SCALE,
    space: SPACE,
    radius: { pill: 9999, card: 0.5 },
    motif: "curve",
  },

  /** Was the `estate` preset. Near-black warm ground, brass accent, serif. */
  luxury: {
    id: "luxury",
    label: "Luxury",
    color: {
      bg: "#12100E",
      surface: "#221E19",
      ink: "#F7F3EC",
      inkMuted: "#A9A096",
      accent: "#B08D57",
      onAccent: "#12100E",
      line: "#3A342C",
    },
    font: { heading: "Playfair Display", body: "Inter", headingWeight: 700 },
    scale: SCALE,
    space: SPACE,
    radius: { pill: 9999, card: 0.25 },
    motif: "rule",
  },

  /** Was the `gallery` preset. Warm paper, ink accent, editorial serif. */
  minimal: {
    id: "minimal",
    label: "Minimal",
    color: {
      bg: "#F4F1EC",
      surface: "#FFFFFF",
      ink: "#1A1A1A",
      inkMuted: "#6B665F",
      accent: "#1A1A1A",
      onAccent: "#F4F1EC",
      line: "#D8D2C8",
    },
    font: { heading: "DM Serif Display", body: "Inter", headingWeight: 400 },
    scale: SCALE,
    space: SPACE,
    radius: { pill: 9999, card: 0 },
    motif: "curve",
  },
};

/**
 * The old preset names, still referenced by the MCP tool schema and by anything
 * an external agent has already been told to send. `render://listing-presets`
 * is a published resource, so these cannot simply disappear.
 */
export const LEGACY_PRESET_TO_THEME = {
  midnight: "modern",
  estate: "luxury",
  gallery: "minimal",
} as const satisfies Record<string, ThemeId>;

export type LegacyPresetName = keyof typeof LEGACY_PRESET_TO_THEME;

export function themeIdFromLegacyPreset(name: string): ThemeId {
  return LEGACY_PRESET_TO_THEME[name as LegacyPresetName] ?? "minimal";
}
