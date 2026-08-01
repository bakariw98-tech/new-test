import { publicOrigin } from "./store";

/**
 * Real-estate carousel layouts, server-side.
 *
 * These live here rather than in a template an agent has to reproduce, because
 * the rules that make a carousel work are not obvious and are easy to lose:
 * Instagram covers the bottom of every frame, a caption needs a scrim matched to
 * the palette, every slide should carry the brokerage, and the last slide has to
 * ask for something. Encoding them means a caller supplies data and gets a
 * correct post, instead of supplying markup and hoping.
 */

const CANVAS = { width: 1080, height: 1350 };
const PHOTO_HEIGHT = 880;

/**
 * The photo does not meet the panel on a flat line — it sweeps into it on a
 * curve, the way a designed social post reads rather than two stacked boxes.
 * The curve is an inline SVG path (Satori renders SVG natively); a thin
 * accent-coloured stroke traces the same sweep.
 *
 * Satori requires `display:flex` on any element using `clip-path` or
 * `transform` — without it its own internal wrapper trips the "more than one
 * child" check. SVG elements do not need it, which is part of why the curve
 * work moved to SVG rather than clip-path.
 */

/** A concave sweep filled with `fill`, spanning `width`, meeting the panel below. */
function curveSweep(opts: {
  top: number;
  width: number;
  depth: number;
  fill: string;
  stroke?: string;
}): string {
  const h = opts.depth + 40;
  // Dips low in the centre, lifts at both edges — one confident arc.
  const path = `M0 40 C ${opts.width * 0.34} ${40 + opts.depth}, ${opts.width * 0.66} ${40 + opts.depth}, ${opts.width} 40`;
  const stroke = opts.stroke
    ? `<path d="${path}" fill="none" stroke="${opts.stroke}" stroke-width="5" opacity="0.9"/>`
    : "";
  return `<svg width="${opts.width}" height="${h}" viewBox="0 0 ${opts.width} ${h}" style="position:absolute;left:0;top:${opts.top}px"><path d="${path} L${opts.width} ${h} L0 ${h} Z" fill="${opts.fill}"/>${stroke}</svg>`;
}

/**
 * The footer's curved top edge rises in the middle and sits CURVE_LIP lower at
 * the left and right edges. Text starts at the left, where the panel is
 * *lowest*, so any content must clear `footerTop + CURVE_LIP` or its first line
 * renders over the photo instead of the panel — unreadable, and invisible until
 * you look at the pixels.
 */
const CURVE_LIP = 90;

/**
 * A rounded footer panel with a curved top edge, sitting at the bottom of a
 * photo slide to hold a caption or CTA legibly over any image.
 */
function curvedFooter(opts: { height: number; width: number; fill: string; stroke?: string }): string {
  const top = CANVAS.height - opts.height;
  const path = `M0 ${CURVE_LIP} C ${opts.width * 0.32} 0, ${opts.width * 0.68} 0, ${opts.width} ${CURVE_LIP}`;
  const stroke = opts.stroke
    ? `<path d="${path}" fill="none" stroke="${opts.stroke}" stroke-width="5" opacity="0.9"/>`
    : "";
  return `<svg width="${opts.width}" height="${opts.height}" viewBox="0 0 ${opts.width} ${opts.height}" style="position:absolute;left:0;top:${top}px"><path d="${path} L${opts.width} ${opts.height} L0 ${opts.height} Z" fill="${opts.fill}"/>${stroke}</svg>`;
}

/**
 * Instagram's UI overlays roughly the bottom 15% (~202px) of a 4:5 frame.
 * Content is kept above this with margin to spare.
 */
export const SAFE_BOTTOM = 260;

const NORMALISER_VERSION = 3;

export type PresetName = "midnight" | "estate" | "gallery";

type Preset = {
  accentColor: string;
  bgColor: string;
  textColor: string;
  mutedColor: string;
  dividerColor: string;
  bandColor: string;
  headingFont: string;
  bodyFont: string;
  headingWeight: number;
  scrimFrom: string;
  scrimTo: string;
  onPhotoText: string;
};

export const PRESETS: Record<PresetName, Preset> = {
  midnight: {
    accentColor: "#F5B841",
    bgColor: "#101828",
    textColor: "#FFFFFF",
    mutedColor: "#9BA3C0",
    dividerColor: "#3A4360",
    bandColor: "#2B3450",
    headingFont: "Inter",
    bodyFont: "Inter",
    headingWeight: 700,
    scrimFrom: "rgba(16,24,40,0)",
    scrimTo: "rgba(16,24,40,0.92)",
    onPhotoText: "#FFFFFF",
  },
  estate: {
    accentColor: "#B08D57",
    bgColor: "#12100E",
    textColor: "#F7F3EC",
    mutedColor: "#A9A096",
    dividerColor: "#3A342C",
    bandColor: "#2A241E",
    headingFont: "Playfair Display",
    bodyFont: "Inter",
    headingWeight: 700,
    scrimFrom: "rgba(18,16,14,0)",
    scrimTo: "rgba(18,16,14,0.93)",
    onPhotoText: "#F7F3EC",
  },
  gallery: {
    accentColor: "#1A1A1A",
    bgColor: "#F4F1EC",
    textColor: "#1A1A1A",
    mutedColor: "#6B665F",
    dividerColor: "#D8D2C8",
    bandColor: "#E2DCD2",
    headingFont: "DM Serif Display",
    bodyFont: "Inter",
    headingWeight: 400,
    scrimFrom: "rgba(244,241,236,0)",
    scrimTo: "rgba(244,241,236,0.97)",
    onPhotoText: "#1A1A1A",
  },
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

/** Small brokerage mark for the footer of a photo slide. */
function brandMark(brand: Brand, colour: string): string {
  const label = brand.brokerage ?? brand.handle;
  if (!label) return "";
  return `<div style="display:flex;margin-top:22px"><div style="display:flex;color:${colour};font-size:26px;font-weight:700;letter-spacing:2px;opacity:0.85">${escapeHtml(label.toUpperCase())}</div></div>`;
}

/** Whether a preset's panel is light (dark text needed) or dark (light text). */
function footerInk(theme: Preset): string {
  return theme.textColor;
}

/** Slide 1: the listing card — photo sweeping on a curve into a data panel. */
export function listingCard(options: {
  photo?: string;
  listing?: Listing;
  brand?: Brand;
  preset?: PresetName;
}): string {
  const theme = PRESETS[options.preset ?? "midnight"];
  const l = options.listing ?? {};
  const brand = options.brand ?? {};

  const photo = options.photo
    ? `<img src="${photoUrl(options.photo, CANVAS.width, PHOTO_HEIGHT)}" style="display:flex;position:absolute;left:0;top:0;width:${CANVAS.width}px;height:${PHOTO_HEIGHT}px;object-fit:cover" />`
    : `<div style="display:flex;position:absolute;left:0;top:0;width:${CANVAS.width}px;height:${PHOTO_HEIGHT}px;background-color:${theme.bandColor}"></div>`;

  // The curve is painted over the bottom of the photo in the panel colour, with
  // an accent stroke tracing its top edge.
  const sweep = curveSweep({
    top: PHOTO_HEIGHT - 190,
    width: CANVAS.width,
    depth: 150,
    fill: theme.bgColor,
    stroke: theme.accentColor,
  });

  const panel = `<div style="display:flex;flex-direction:column;position:absolute;left:0;top:900px;width:100%;height:450px;padding:24px 64px 56px 64px;justify-content:space-between">
    <div style="display:flex;flex-direction:column">
      <div style="display:flex;color:${theme.textColor};font-size:56px;font-weight:${theme.headingWeight};font-family:${theme.headingFont}">${escapeHtml(l.street ?? "")}</div>
      <div style="display:flex;color:${theme.mutedColor};font-size:36px;margin-top:12px">${escapeHtml(l.cityState ?? "")}</div>
    </div>
    <div style="display:flex;flex-direction:row;justify-content:space-between">
      ${["Beds", "Baths", "Sq Ft"]
        .map(
          (label, i) =>
            `<div style="display:flex;flex-direction:column;align-items:flex-start">
              <div style="display:flex;color:${theme.accentColor};font-size:48px;font-weight:700">${escapeHtml([l.beds, l.baths, l.sqft][i] ?? "—")}</div>
              <div style="display:flex;color:${theme.mutedColor};font-size:28px">${label}</div>
            </div>`,
        )
        .join("")}
    </div>
    <div style="display:flex;flex-direction:row;align-items:center;justify-content:space-between">
      <div style="display:flex;color:${theme.textColor};font-size:32px;font-weight:700">${escapeHtml(brand.brokerage ?? "")}</div>
      <div style="display:flex;color:${theme.accentColor};font-size:32px">${escapeHtml(brand.handle ?? "Swipe for tour →")}</div>
    </div>
  </div>`;

  // Pill-shaped chips — the rounded shape echoes the curve rather than fighting it.
  const chips = `<div style="display:flex;position:absolute;left:56px;top:56px;background-color:${theme.bgColor};border-radius:9999px;padding:16px 32px">
    <div style="display:flex;color:${theme.accentColor};font-size:34px;font-weight:700">${escapeHtml(l.badge ?? "JUST LISTED")}</div>
  </div>
  <div style="display:flex;position:absolute;right:56px;top:56px;background-color:${theme.accentColor};border-radius:9999px;padding:16px 32px">
    <div style="display:flex;color:${theme.bgColor};font-size:34px;font-weight:${theme.headingWeight};font-family:${theme.headingFont}">${escapeHtml(l.price ?? "")}</div>
  </div>`;

  return `<div style="display:flex;flex-direction:column;width:100%;height:100%;background-color:${theme.bgColor};position:relative;font-family:${theme.bodyFont}">
  ${photo}
  ${sweep}
  ${panel}
  ${chips}
</div>`;
}

/**
 * Middle slides: full-bleed photo with a curved footer panel holding the
 * caption. The curved top edge is the same signature as the card's sweep, so
 * the set reads as one designed system.
 */
export function tourSlide(options: {
  photo: string;
  caption?: string;
  index?: number;
  total?: number;
  brand?: Brand;
  preset?: PresetName;
}): string {
  const theme = PRESETS[options.preset ?? "midnight"];
  const brand = options.brand ?? {};

  const counter =
    options.index && options.total
      ? `<div style="display:flex;position:absolute;left:56px;top:56px;background-color:${theme.bgColor};border-radius:9999px;padding:14px 28px">
           <div style="display:flex;color:${theme.accentColor};font-size:30px;font-weight:700">${options.index} / ${options.total}</div>
         </div>`
      : "";

  // Deep enough that a two-line caption still starts below the curve's lip at
  // the left edge (footer top 770 + lip 90 = 860; a two-line caption bottomed at
  // SAFE_BOTTOM starts around 913).
  const footerHeight = 580;
  const footer = curvedFooter({
    height: footerHeight,
    width: CANVAS.width,
    fill: theme.bgColor,
    stroke: theme.accentColor,
  });

  const footerContent = `<div style="display:flex;flex-direction:column;position:absolute;left:0;bottom:${SAFE_BOTTOM}px;width:${CANVAS.width}px;padding:0 64px">
    ${options.caption ? `<div style="display:flex;color:${footerInk(theme)};font-size:56px;font-weight:${theme.headingWeight};font-family:${theme.headingFont};line-height:1.15">${escapeHtml(options.caption)}</div>` : ""}
    ${brandMark(brand, theme.mutedColor)}
  </div>`;

  return `<div style="display:flex;position:relative;width:100%;height:100%;background-color:${theme.bgColor};font-family:${theme.bodyFont}">
  <img src="${photoUrl(options.photo, CANVAS.width, CANVAS.height)}" style="position:absolute;left:0;top:0;width:${CANVAS.width}px;height:${CANVAS.height}px;object-fit:cover" />
  ${footer}
  ${counter}
  ${footerContent}
</div>`;
}

/**
 * Final slide: the ask. Always renders a contact block over a curved footer —
 * the whole post exists to produce this one action.
 */
export function closingSlide(options: {
  photo?: string;
  headline?: string;
  listing?: Listing;
  brand?: Brand;
  preset?: PresetName;
}): string {
  const theme = PRESETS[options.preset ?? "midnight"];
  const brand = options.brand ?? {};
  const l = options.listing ?? {};

  const background = options.photo
    ? `<img src="${photoUrl(options.photo, CANVAS.width, CANVAS.height)}" style="position:absolute;left:0;top:0;width:${CANVAS.width}px;height:${CANVAS.height}px;object-fit:cover" />`
    : `<div style="display:flex;position:absolute;left:0;top:0;width:${CANVAS.width}px;height:${CANVAS.height}px;background-color:${theme.bgColor}"></div>`;

  // Taller than the tour footer because this slide stacks four elements —
  // headline, address, CTA pill, brand mark (~276px). Bottomed at SAFE_BOTTOM
  // that starts around 814, clearing the curve's lip at 740.
  const footerHeight = 700;
  const footer = curvedFooter({
    height: footerHeight,
    width: CANVAS.width,
    fill: theme.bgColor,
    stroke: theme.accentColor,
  });

  const contactLine = brand.contact ?? brand.handle ?? "";
  const contact = contactLine
    ? `<div style="display:flex;align-self:flex-start;background-color:${theme.accentColor};border-radius:9999px;padding:22px 44px;margin-top:32px">
         <div style="display:flex;color:${theme.bgColor};font-size:34px;font-weight:700">${escapeHtml(contactLine)}</div>
       </div>`
    : "";

  const address = [l.street, l.cityState].filter(Boolean).join(" · ");

  const footerContent = `<div style="display:flex;flex-direction:column;position:absolute;left:0;bottom:${SAFE_BOTTOM}px;width:${CANVAS.width}px;padding:0 64px">
    <div style="display:flex;color:${theme.textColor};font-size:64px;font-weight:${theme.headingWeight};font-family:${theme.headingFont};line-height:1.12">${escapeHtml(options.headline ?? "Book a private showing")}</div>
    ${address ? `<div style="display:flex;color:${theme.mutedColor};font-size:30px;margin-top:16px">${escapeHtml(address)}</div>` : ""}
    ${contact}
    ${brandMark(brand, theme.mutedColor)}
  </div>`;

  return `<div style="display:flex;position:relative;width:100%;height:100%;background-color:${theme.bgColor};font-family:${theme.bodyFont}">
  ${background}
  ${footer}
  ${footerContent}
</div>`;
}
