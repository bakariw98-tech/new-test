/**
 * The shape every slide component receives.
 *
 * Kept deliberately flat and pre-formatted: a slide should never do arithmetic
 * or decide how a price is punctuated. `lib/core/format.ts` already did that
 * once, and the whole point of this architecture is that it happens exactly
 * once for every output.
 */

/** Instagram's UI covers roughly the bottom 200px of a 4:5 post. */
export const SAFE_BOTTOM = 260;

export const CANVAS = { width: 1080, height: 1350 } as const;

export type SlideTheme = {
  bg: string;
  surface: string;
  ink: string;
  inkMuted: string;
  accent: string;
  onAccent: string;
  line: string;
  headingFont: string;
  bodyFont: string;
  headingWeight: 400 | 700;
};

export type SlideProps = {
  listing: {
    badge: string;
    price: string;
    address: string;
    cityStateZip: string;
    stats: Array<{ label: string; value: string }>;
  };
  brand: {
    brokerage: string;
    handle: string;
    cta: string;
  };
  theme: SlideTheme;
  /** Absolute URLs, already normalised to JPEG/PNG. */
  photos: string[];
  caption?: string;
  index?: number;
  total?: number;
};
