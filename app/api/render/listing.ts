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
const BAND_HEIGHT = 820;
const PANEL_HEIGHT = CANVAS.height - BAND_HEIGHT;

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

/** Small brokerage mark, carried on every slide so a screenshot stays attributed. */
function brandMark(brand: Brand, theme: Preset, onPhoto: boolean): string {
  const label = brand.brokerage ?? brand.handle;
  if (!label) return "";

  const colour = onPhoto ? theme.onPhotoText : theme.textColor;
  return `<div style="display:flex;position:absolute;left:64px;bottom:${SAFE_BOTTOM - 96}px">
    <div style="display:flex;color:${colour};font-size:26px;font-weight:700;letter-spacing:2px;opacity:0.85">${escapeHtml(label.toUpperCase())}</div>
  </div>`;
}

/** Slide 1: the listing card — photo band over a data panel. */
export function listingCard(options: {
  photo?: string;
  listing?: Listing;
  brand?: Brand;
  preset?: PresetName;
}): string {
  const theme = PRESETS[options.preset ?? "midnight"];
  const l = options.listing ?? {};
  const brand = options.brand ?? {};

  const band = options.photo
    ? `<img src="${photoUrl(options.photo, CANVAS.width, BAND_HEIGHT)}" style="position:absolute;left:0;top:0;width:${CANVAS.width}px;height:${BAND_HEIGHT}px;object-fit:cover" />
       <div style="display:flex;position:absolute;left:0;top:0;width:${CANVAS.width}px;height:${BAND_HEIGHT}px;background:linear-gradient(180deg,rgba(0,0,0,0.42) 0%,rgba(0,0,0,0.04) 34%,rgba(0,0,0,0.12) 100%)"></div>`
    : `<div style="display:flex;position:absolute;left:0;top:0;width:100%;height:${BAND_HEIGHT}px;background-color:${theme.bandColor}"></div>`;

  const stat = (value: string, label: string) =>
    `<div style="display:flex;flex-direction:column;align-items:flex-start">
      <div style="display:flex;color:${theme.accentColor};font-size:48px;font-weight:700">${escapeHtml(value)}</div>
      <div style="display:flex;color:${theme.mutedColor};font-size:28px">${label}</div>
    </div>`;

  const footerRight = brand.handle ?? "Swipe for tour →";

  return `<div style="display:flex;flex-direction:column;width:100%;height:100%;background-color:${theme.bgColor};position:relative;font-family:${theme.bodyFont}">
  ${band}
  <div style="display:flex;position:absolute;left:56px;top:56px;background-color:${theme.accentColor};border-radius:12px;padding:16px 28px">
    <div style="display:flex;color:${theme.bgColor};font-size:34px;font-weight:700">${escapeHtml(l.badge ?? "JUST LISTED")}</div>
  </div>
  <div style="display:flex;position:absolute;right:56px;top:56px;background-color:${theme.bgColor};border-radius:12px;padding:16px 28px">
    <div style="display:flex;color:${theme.accentColor};font-size:34px;font-weight:${theme.headingWeight};font-family:${theme.headingFont}">${escapeHtml(l.price ?? "")}</div>
  </div>
  <div style="display:flex;flex-direction:column;position:absolute;left:0;top:${BAND_HEIGHT}px;width:100%;height:${PANEL_HEIGHT}px;background-color:${theme.bgColor};padding:56px 64px;justify-content:space-between">
    <div style="display:flex;flex-direction:column">
      <div style="display:flex;color:${theme.textColor};font-size:56px;font-weight:${theme.headingWeight};font-family:${theme.headingFont}">${escapeHtml(l.street ?? "")}</div>
      <div style="display:flex;color:${theme.mutedColor};font-size:36px;margin-top:12px">${escapeHtml(l.cityState ?? "")}</div>
    </div>
    <div style="display:flex;width:100%;height:2px;background-color:${theme.dividerColor}"></div>
    <div style="display:flex;flex-direction:row;justify-content:space-between">
      ${stat(l.beds ?? "—", "Beds")}
      ${stat(l.baths ?? "—", "Baths")}
      ${stat(l.sqft ?? "—", "Sq Ft")}
    </div>
    <div style="display:flex;flex-direction:row;align-items:center;justify-content:space-between">
      <div style="display:flex;color:${theme.textColor};font-size:32px;font-weight:700">${escapeHtml(brand.brokerage ?? "")}</div>
      <div style="display:flex;color:${theme.accentColor};font-size:32px">${escapeHtml(footerRight)}</div>
    </div>
  </div>
</div>`;
}

/** Middle slides: a photo, a caption above the safe zone, the brokerage mark. */
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
      ? `<div style="display:flex;position:absolute;left:56px;top:56px;background-color:${theme.bgColor};border-radius:12px;padding:14px 24px">
           <div style="display:flex;color:${theme.accentColor};font-size:30px;font-weight:700">${options.index} / ${options.total}</div>
         </div>`
      : "";

  const caption = options.caption
    ? `<div style="display:flex;flex-direction:column;position:absolute;left:0;bottom:${SAFE_BOTTOM}px;width:${CANVAS.width}px;padding:0 64px">
         <div style="display:flex;color:${theme.onPhotoText};font-size:60px;font-weight:${theme.headingWeight};font-family:${theme.headingFont};line-height:1.15">${escapeHtml(options.caption)}</div>
       </div>`
    : "";

  return `<div style="display:flex;position:relative;width:100%;height:100%;background-color:${theme.bgColor};font-family:${theme.bodyFont}">
  <img src="${photoUrl(options.photo, CANVAS.width, CANVAS.height)}" style="position:absolute;left:0;top:0;width:${CANVAS.width}px;height:${CANVAS.height}px;object-fit:cover" />
  <div style="display:flex;position:absolute;left:0;top:0;width:${CANVAS.width}px;height:${CANVAS.height}px;background:linear-gradient(180deg,${theme.scrimFrom} 0%,${theme.scrimFrom} 42%,${theme.scrimTo} 100%)"></div>
  ${counter}
  ${caption}
  ${brandMark(brand, theme, true)}
</div>`;
}

/**
 * Final slide: the ask.
 *
 * A carousel that ends without a way to respond wastes the attention it just
 * earned, so this always renders a contact block — the whole post exists to
 * produce this one action.
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
    ? `<img src="${photoUrl(options.photo, CANVAS.width, CANVAS.height)}" style="position:absolute;left:0;top:0;width:${CANVAS.width}px;height:${CANVAS.height}px;object-fit:cover" />
       <div style="display:flex;position:absolute;left:0;top:0;width:${CANVAS.width}px;height:${CANVAS.height}px;background:linear-gradient(180deg,${theme.scrimFrom} 0%,${theme.scrimTo} 62%,${theme.scrimTo} 100%)"></div>`
    : `<div style="display:flex;position:absolute;left:0;top:0;width:${CANVAS.width}px;height:${CANVAS.height}px;background-color:${theme.bgColor}"></div>`;

  const contactLine = brand.contact ?? brand.handle ?? "";
  const contact = contactLine
    ? `<div style="display:flex;align-self:flex-start;background-color:${theme.accentColor};border-radius:9999px;padding:22px 40px;margin-top:36px">
         <div style="display:flex;color:${theme.bgColor};font-size:34px;font-weight:700">${escapeHtml(contactLine)}</div>
       </div>`
    : "";

  const address = [l.street, l.cityState].filter(Boolean).join(" · ");

  return `<div style="display:flex;position:relative;width:100%;height:100%;background-color:${theme.bgColor};font-family:${theme.bodyFont}">
  ${background}
  <div style="display:flex;flex-direction:column;position:absolute;left:0;bottom:${SAFE_BOTTOM}px;width:${CANVAS.width}px;padding:0 64px">
    <div style="display:flex;color:${theme.onPhotoText};font-size:64px;font-weight:${theme.headingWeight};font-family:${theme.headingFont};line-height:1.12">${escapeHtml(options.headline ?? "Book a private showing")}</div>
    ${address ? `<div style="display:flex;color:${theme.onPhotoText};font-size:30px;margin-top:18px;opacity:0.8">${escapeHtml(address)}</div>` : ""}
    ${contact}
  </div>
  ${brandMark(brand, theme, true)}
</div>`;
}
