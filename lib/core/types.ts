/**
 * The source of truth.
 *
 * Every renderer — carousel, website, PDF, QR, captions, and later video —
 * consumes a `RenderContext` and nothing else. No renderer reads the database,
 * formats a price, or decides a colour. That constraint is what lets a new
 * output be a new function rather than a new implementation of the product.
 *
 * Note the shape of `Listing`: raw values, not display strings. The old
 * carousel took `{ price?: "$8,495,000", sqft?: "5,207" }` because the caller
 * did the formatting, which meant the same listing could render three different
 * ways across three assets. Storage is now `priceCents: 849500000` and
 * `lib/core/format.ts` owns every display decision exactly once.
 */

export type ListingStatus = "draft" | "published" | "archived";

export type Listing = {
  id: string;
  accountId: string;
  slug: string;
  status: ListingStatus;

  street: string;
  city: string;
  state: string;
  zip: string;

  priceCents: number;
  beds: number;
  bathsFull: number;
  bathsHalf: number;
  sqft: number | null;
  lotSqft: number | null;
  yearBuilt: number | null;

  description: string;
  features: string[];

  mlsId: string | null;
  publishedAt: string | null;
};

export type PhotoRole = "hero" | "gallery";

export type Photo = {
  id: string;
  /** Absolute, fetchable URL. Renderers never see a storage path. */
  url: string;
  sortOrder: number;
  role: PhotoRole;
  width: number | null;
  height: number | null;
  alt: string | null;
};

export type FontKey = "Inter" | "Poppins" | "Playfair Display" | "DM Serif Display";

export type ThemeId = "modern" | "luxury" | "minimal";

export type BrandProfile = {
  accountId: string;
  /** null on the account-default profile; set on a per-agent override. */
  agentUserId: string | null;

  logoUrl: string | null;
  headshotUrl: string | null;

  /** Overrides the theme's accent when set. Everything else comes from tokens. */
  accentColor: string | null;
  headingFont: FontKey | null;
  bodyFont: FontKey | null;

  agentName: string;
  agentTitle: string | null;
  phone: string | null;
  email: string | null;

  brokerageName: string;
  brokerageLicense: string | null;

  instagram: string | null;
  facebook: string | null;
  linkedin: string | null;
  website: string | null;

  ctaText: string;
  legalDisclaimer: string | null;
  defaultTheme: ThemeId;
};

/** A single label/value pair in the stat row. Shared by every medium. */
export type Stat = { label: string; value: string };

/**
 * Everything a renderer needs, fully resolved. `formatted` is computed once in
 * `lib/core/format.ts` so a price cannot drift between the carousel, the site,
 * and the flyer.
 */
export type RenderContext = {
  listing: Listing;
  photos: Photo[];
  brand: BrandProfile;
  theme: ResolvedTheme;

  formatted: {
    price: string;
    priceShort: string;
    address: string;
    cityStateZip: string;
    fullAddress: string;
    beds: string;
    baths: string;
    sqft: string;
    stats: Stat[];
    /** "AURORA ESTATES" — uppercased, for the brand mark. */
    brandMark: string;
    /** Brokerage line plus licence and disclaimer, ready to append. */
    attribution: string;
  };

  urls: {
    site: string;
    qr: string;
  };
};

/**
 * Theme tokens with a base unit applied. See `lib/design/tokens.ts` for why the
 * type scale is stored as ratios rather than pixels.
 */
export type ResolvedTheme = {
  id: ThemeId;
  color: {
    bg: string;
    surface: string;
    ink: string;
    inkMuted: string;
    accent: string;
    onAccent: string;
    line: string;
  };
  font: {
    heading: FontKey;
    body: FontKey;
    headingWeight: 400 | 700;
  };
  /** Absolute sizes in the caller's unit (px for screen, pt for print). */
  size: {
    display: number;
    h1: number;
    h2: number;
    body: number;
    caption: number;
    micro: number;
  };
  /** Absolute spacing steps in the caller's unit. */
  space: number[];
  radius: { pill: number; card: number };
  motif: "curve" | "rule" | "none";
};
