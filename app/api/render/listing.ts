import type { ResolvedTheme } from "../../../lib/core/types";
import { resolveTheme } from "../../../lib/design/resolve";
import { themeIdFromLegacyPreset } from "../../../lib/design/tokens";
import { publicOrigin } from "./store";

/**
 * Real-estate carousel layouts, server-side.
 *
 * These live here rather than in a template an agent has to reproduce, because
 * the rules that make a carousel work are not obvious and are easy to lose:
 * Instagram covers the bottom of every frame, text over a photo needs a panel
 * behind it, every slide should carry the brokerage, and the last slide has to
 * ask for something. Encoding them means a caller supplies data and gets a
 * correct post, instead of supplying markup and hoping.
 *
 * Colours, fonts and sizes are NOT defined here — they come from
 * `lib/design/tokens.ts`, resolved for the `carousel` medium. This file owns
 * geometry only. That split is what lets the website and the flyer look like
 * siblings of these slides rather than cousins.
 */

const CANVAS = { width: 1080, height: 1350 };
const PHOTO_HEIGHT = 880;

/**
 * Instagram's UI overlays roughly the bottom 15% (~202px) of a 4:5 frame.
 * Content is kept above this with margin to spare.
 */
export const SAFE_BOTTOM = 260;

/**
 * A curved footer's top edge rises in the middle and sits CURVE_LIP lower at
 * the left and right edges. Text starts at the left, where the panel is
 * *lowest*, so content must clear `footerTop + CURVE_LIP` or its first line
 * renders over the photo instead of the panel.
 */
const CURVE_LIP = 90;

const NORMALISER_VERSION = 3;

/** Stroke weight for the accent line that traces a seam. */
const SEAM_STROKE = 5;

export type PresetName = "midnight" | "estate" | "gallery";

/**
 * The published preset names, kept because `render://listing-presets` is an MCP
 * resource external agents already consume. Each maps to a theme; the values
 * below are projected from the tokens so there is still exactly one place a
 * colour is defined.
 */
function describePreset(name: PresetName) {
  const theme = carouselTheme(name);
  return {
    theme: theme.id,
    accentColor: theme.color.accent,
    bgColor: theme.color.bg,
    textColor: theme.color.ink,
    mutedColor: theme.color.inkMuted,
    bandColor: theme.color.surface,
    headingFont: theme.font.heading,
    bodyFont: theme.font.body,
    headingWeight: theme.font.headingWeight,
    motif: theme.motif,
  };
}

export const PRESETS = {
  midnight: describePreset("midnight"),
  estate: describePreset("estate"),
  gallery: describePreset("gallery"),
};

export type Listing = {
  badge?: string;
  price?: string;
  street?: string;
  cityState?: string;
  beds?: string;
  baths?: string;
  sqft?: string;
};

export type Brand = {
  brokerage?: string;
  handle?: string;
  contact?: string;
};

function carouselTheme(preset: PresetName | undefined): ResolvedTheme {
  return resolveTheme({ themeId: themeIdFromLegacyPreset(preset ?? "gallery"), medium: "carousel" });
}

/** Route every photo through the normaliser: format conversion plus pre-sizing. */
function photoUrl(src: string, width: number, height: number): string {
  const origin = publicOrigin();
  const param = /^[a-zA-Z0-9_-]{20,}$/.test(src)
    ? `drive=${encodeURIComponent(src)}`
    : `src=${encodeURIComponent(src)}`;
  return `${origin}/api/image?${param}&w=${width}&h=${height}&fit=cover&v=${NORMALISER_VERSION}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/*
 * ---------------------------------------------------------------------------
 * Seams — how a photo meets a panel. This is the theme's `motif`, and it is the
 * biggest reason three themes read as three designs rather than three palettes.
 *
 * Satori renders inline SVG natively. Unlike `clip-path` it does not require
 * `display:flex` on the same element, which is an undocumented Satori quirk
 * that otherwise throws "more than one child node".
 * ---------------------------------------------------------------------------
 */

/**
 * The seam under the listing card's photo. Returns the markup plus the y-offset
 * where the panel below can safely start drawing text.
 */
function cardSeam(theme: ResolvedTheme): { markup: string; panelTop: number } {
  const w = CANVAS.width;

  if (theme.motif === "curve") {
    const depth = 150;
    const h = depth + 40;
    const top = PHOTO_HEIGHT - 190;
    const path = `M0 40 C ${w * 0.34} ${40 + depth}, ${w * 0.66} ${40 + depth}, ${w} 40`;
    return {
      markup:
        `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:0;top:${top}px">` +
        `<path d="${path} L${w} ${h} L0 ${h} Z" fill="${theme.color.bg}"/>` +
        `<path d="${path}" fill="none" stroke="${theme.color.accent}" stroke-width="${SEAM_STROKE}" opacity="0.9"/>` +
        `</svg>`,
      panelTop: PHOTO_HEIGHT + 20,
    };
  }

  if (theme.motif === "rule") {
    return {
      markup: `<div style="display:flex;position:absolute;left:0;top:${PHOTO_HEIGHT}px;width:${w}px;height:${SEAM_STROKE}px;background-color:${theme.color.accent}"></div>`,
      panelTop: PHOTO_HEIGHT + SEAM_STROKE,
    };
  }

  return { markup: "", panelTop: PHOTO_HEIGHT };
}

/**
 * The panel behind text on a full-bleed photo slide. Returns the markup plus
 * the lowest y its top edge reaches, which is what content has to clear.
 */
function photoFooter(theme: ResolvedTheme, height: number): { markup: string; contentTop: number } {
  const w = CANVAS.width;
  const top = CANVAS.height - height;

  if (theme.motif === "curve") {
    const path = `M0 ${CURVE_LIP} C ${w * 0.32} 0, ${w * 0.68} 0, ${w} ${CURVE_LIP}`;
    return {
      markup:
        `<svg width="${w}" height="${height}" viewBox="0 0 ${w} ${height}" style="position:absolute;left:0;top:${top}px">` +
        `<path d="${path} L${w} ${height} L0 ${height} Z" fill="${theme.color.bg}"/>` +
        `<path d="${path}" fill="none" stroke="${theme.color.accent}" stroke-width="${SEAM_STROKE}" opacity="0.9"/>` +
        `</svg>`,
      // The curve's lowest point is at the left and right edges, where text starts.
      contentTop: top + CURVE_LIP,
    };
  }

  const rule =
    theme.motif === "rule"
      ? `<div style="display:flex;position:absolute;left:0;top:${top}px;width:${w}px;height:${SEAM_STROKE}px;background-color:${theme.color.accent}"></div>`
      : "";
  return {
    markup:
      `<div style="display:flex;position:absolute;left:0;top:${top}px;width:${w}px;height:${height}px;background-color:${theme.color.bg}"></div>${rule}`,
    contentTop: top + SEAM_STROKE,
  };
}

/** Small brokerage mark for the footer of a photo slide. */
function brandMark(brand: Brand, theme: ResolvedTheme): string {
  const label = brand.brokerage ?? brand.handle;
  if (!label) return "";
  return `<div style="display:flex;margin-top:${theme.space[3]}px"><div style="display:flex;color:${theme.color.inkMuted};font-size:${theme.size.micro}px;font-weight:700;letter-spacing:2px">${escapeHtml(label.toUpperCase())}</div></div>`;
}

/** A pill chip. Filled with the accent, or with the ground when `inverted`. */
function chip(text: string, theme: ResolvedTheme, position: string, inverted = false): string {
  const bg = inverted ? theme.color.bg : theme.color.accent;
  const fg = inverted ? theme.color.accent : theme.color.onAccent;
  return `<div style="display:flex;position:absolute;${position};background-color:${bg};border-radius:${theme.radius.pill}px;padding:${theme.space[2]}px ${theme.space[5]}px">
    <div style="display:flex;color:${fg};font-size:${theme.size.caption}px;font-weight:700">${escapeHtml(text)}</div>
  </div>`;
}

/** Slide 1: the listing card — photo meeting a data panel on the theme's seam. */
export function listingCard(options: {
  photo?: string;
  listing?: Listing;
  brand?: Brand;
  preset?: PresetName;
}): string {
  const theme = carouselTheme(options.preset);
  const l = options.listing ?? {};
  const brand = options.brand ?? {};

  const photo = options.photo
    ? `<img src="${photoUrl(options.photo, CANVAS.width, PHOTO_HEIGHT)}" style="display:flex;position:absolute;left:0;top:0;width:${CANVAS.width}px;height:${PHOTO_HEIGHT}px;object-fit:cover" />`
    : `<div style="display:flex;position:absolute;left:0;top:0;width:${CANVAS.width}px;height:${PHOTO_HEIGHT}px;background-color:${theme.color.surface}"></div>`;

  const seam = cardSeam(theme);

  // Sq Ft is dropped rather than dashed when absent — an empty column reads as
  // missing data and makes the whole card look unfinished.
  const stats: Array<[string, string]> = [
    ["Beds", l.beds ?? ""],
    ["Baths", l.baths ?? ""],
    ["Sq Ft", l.sqft ?? ""],
  ];
  const statRow = stats
    .filter(([, value]) => value !== "")
    .map(
      ([label, value]) => `<div style="display:flex;flex-direction:column">
        <div style="display:flex;color:${theme.color.accent};font-size:${theme.size.h1}px;font-weight:700;font-family:${theme.font.body}">${escapeHtml(value)}</div>
        <div style="display:flex;color:${theme.color.inkMuted};font-size:${theme.size.micro}px">${label}</div>
      </div>`,
    )
    .join("");

  const panel = `<div style="display:flex;flex-direction:column;position:absolute;left:0;top:${seam.panelTop}px;width:100%;height:${CANVAS.height - seam.panelTop}px;padding:${theme.space[5]}px 64px ${theme.space[6]}px 64px;justify-content:space-between">
    <div style="display:flex;flex-direction:column">
      <div style="display:flex;color:${theme.color.ink};font-size:${theme.size.h1}px;font-weight:${theme.font.headingWeight};font-family:${theme.font.heading}">${escapeHtml(l.street ?? "")}</div>
      <div style="display:flex;color:${theme.color.inkMuted};font-size:${theme.size.body}px;margin-top:${theme.space[1]}px">${escapeHtml(l.cityState ?? "")}</div>
    </div>
    <div style="display:flex;flex-direction:row;justify-content:space-between">${statRow}</div>
    <div style="display:flex;flex-direction:row;justify-content:space-between;align-items:center">
      <div style="display:flex;color:${theme.color.ink};font-size:${theme.size.caption}px;font-weight:700;letter-spacing:1px">${escapeHtml(brand.brokerage ?? "")}</div>
      <div style="display:flex;color:${theme.color.accent};font-size:${theme.size.caption}px">${escapeHtml(brand.handle ?? "")}</div>
    </div>
  </div>`;

  const chips =
    chip(l.badge ?? "JUST LISTED", theme, "left:56px;top:56px", true) +
    chip(l.price ?? "", theme, "right:56px;top:56px");

  return `<div style="display:flex;flex-direction:column;width:100%;height:100%;background-color:${theme.color.bg};position:relative;font-family:${theme.font.body}">
  ${photo}
  ${seam.markup}
  ${panel}
  ${chips}
</div>`;
}

/**
 * Middle slides: full-bleed photo with a panel holding the caption. The panel's
 * top edge is the same seam as the card's, so the set reads as one system.
 */
export function tourSlide(options: {
  photo: string;
  caption?: string;
  index?: number;
  total?: number;
  brand?: Brand;
  preset?: PresetName;
}): string {
  const theme = carouselTheme(options.preset);
  const brand = options.brand ?? {};

  const counter =
    options.index && options.total
      ? chip(`${options.index} / ${options.total}`, theme, "left:56px;top:56px", true)
      : "";

  // Deep enough that a two-line caption still starts below the seam. See the
  // assertion in listing.test.ts, which fails if this stops being true.
  const footer = photoFooter(theme, 620);

  const content = `<div style="display:flex;flex-direction:column;position:absolute;left:0;bottom:${SAFE_BOTTOM}px;width:${CANVAS.width}px;padding:0 64px">
    ${options.caption ? `<div style="display:flex;color:${theme.color.ink};font-size:${theme.size.h1}px;font-weight:${theme.font.headingWeight};font-family:${theme.font.heading};line-height:1.15">${escapeHtml(options.caption)}</div>` : ""}
    ${brandMark(brand, theme)}
  </div>`;

  return `<div style="display:flex;position:relative;width:100%;height:100%;background-color:${theme.color.bg};font-family:${theme.font.body}">
  <img src="${photoUrl(options.photo, CANVAS.width, CANVAS.height)}" style="position:absolute;left:0;top:0;width:${CANVAS.width}px;height:${CANVAS.height}px;object-fit:cover" />
  ${footer.markup}
  ${counter}
  ${content}
</div>`;
}

/**
 * Final slide: the ask. Always renders a contact block — the whole post exists
 * to produce this one action.
 */
export function closingSlide(options: {
  photo?: string;
  headline?: string;
  listing?: Listing;
  brand?: Brand;
  preset?: PresetName;
}): string {
  const theme = carouselTheme(options.preset);
  const brand = options.brand ?? {};
  const l = options.listing ?? {};

  const background = options.photo
    ? `<img src="${photoUrl(options.photo, CANVAS.width, CANVAS.height)}" style="position:absolute;left:0;top:0;width:${CANVAS.width}px;height:${CANVAS.height}px;object-fit:cover" />`
    : `<div style="display:flex;position:absolute;left:0;top:0;width:${CANVAS.width}px;height:${CANVAS.height}px;background-color:${theme.color.surface}"></div>`;

  // Taller than the tour footer: this slide stacks headline, address, CTA pill
  // and brand mark.
  const footer = photoFooter(theme, 700);

  const contactLine = brand.contact ?? brand.handle ?? "";
  const contact = contactLine
    ? `<div style="display:flex;align-self:flex-start;background-color:${theme.color.accent};border-radius:${theme.radius.pill}px;padding:${theme.space[3]}px ${theme.space[6]}px;margin-top:${theme.space[3]}px">
         <div style="display:flex;color:${theme.color.onAccent};font-size:${theme.size.caption}px;font-weight:700">${escapeHtml(contactLine)}</div>
       </div>`
    : "";

  const address = [l.street, l.cityState].filter(Boolean).join(" · ");

  const content = `<div style="display:flex;flex-direction:column;position:absolute;left:0;bottom:${SAFE_BOTTOM}px;width:${CANVAS.width}px;padding:0 64px">
    <div style="display:flex;color:${theme.color.ink};font-size:${theme.size.h1}px;font-weight:${theme.font.headingWeight};font-family:${theme.font.heading};line-height:1.12">${escapeHtml(options.headline ?? "Book a private showing")}</div>
    ${address ? `<div style="display:flex;color:${theme.color.inkMuted};font-size:${theme.size.caption}px;margin-top:${theme.space[2]}px">${escapeHtml(address)}</div>` : ""}
    ${contact}
    ${brandMark(brand, theme)}
  </div>`;

  return `<div style="display:flex;position:relative;width:100%;height:100%;background-color:${theme.color.bg};font-family:${theme.font.body}">
  ${background}
  ${footer.markup}
  ${content}
</div>`;
}

/** Exposed for the layout tests, which assert content clears the seam. */
export const __geometry = { CANVAS, PHOTO_HEIGHT, CURVE_LIP, cardSeam, photoFooter, carouselTheme };
