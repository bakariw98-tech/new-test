/**
 * Listing Card Template — for the hello-world-mcp `render_image` tool.
 *
 * Adapted from the original Drive template. The change: the top band is now a
 * real photo rather than a flat colour. Photos route through /api/image, which
 * converts formats Satori cannot decode (WebP, AVIF) and pre-sizes them.
 *
 * Usage:
 *   const markup = listingCard({ photo: "https://...", price: "$489,000", ... });
 *   // then call render_image with { markup, size: "ig-portrait", output: "url" }
 */

const ORIGIN = process.env.RENDER_ORIGIN || "https://hello-world-mcp.vercel.app";

const BAND_HEIGHT = 820;
const PANEL_HEIGHT = 530;

/** Wraps any image URL so it arrives as JPEG at the right size. */
function normalised(src, width = 1080, height = BAND_HEIGHT) {
  return `${ORIGIN}/api/image?src=${encodeURIComponent(src)}&w=${width}&h=${height}&fit=cover`;
}

function listingCard({
  photo = "",                      // property photo URL; falls back to bandColor when absent
  badge = "JUST LISTED",
  price = "$000,000",
  street = "123 Main St",
  cityState = "City, MI 00000",
  beds = "0",
  baths = "0",
  sqft = "0,000",
  brokerage = "Your Brokerage",
  cta = "Swipe for tour →",
  scrim = true,                    // darkens the photo bottom so the badge/price stay legible
  bandColor = "#2b3450",
  accentColor = "#F5B841",
  bgColor = "#101828",
  textColor = "#FFFFFF",
  mutedColor = "#9BA3C0",
  dividerColor = "#3a4360",
} = {}) {
  const band = photo
    ? `<img src="${normalised(photo)}" style="position:absolute;left:0;top:0;width:1080px;height:${BAND_HEIGHT}px;object-fit:cover" />`
    : `<div style="display:flex;position:absolute;left:0;top:0;width:100%;height:${BAND_HEIGHT}px;background-color:${bandColor}"></div>`;

  // A photo can be bright anywhere, so the chips need their own contrast.
  const overlay =
    photo && scrim
      ? `<div style="display:flex;position:absolute;left:0;top:0;width:1080px;height:${BAND_HEIGHT}px;background:linear-gradient(180deg,rgba(16,24,40,0.55) 0%,rgba(16,24,40,0.05) 38%,rgba(16,24,40,0.35) 100%)"></div>`
      : "";

  const stat = (value, label) =>
    `<div style="display:flex;flex-direction:column;align-items:flex-start">
      <div style="display:flex;color:${accentColor};font-size:48px;font-weight:700">${value}</div>
      <div style="display:flex;color:${mutedColor};font-size:28px">${label}</div>
    </div>`;

  return `<div style="display:flex;flex-direction:column;width:100%;height:100%;background-color:${bgColor};position:relative;font-family:Inter">
  ${band}
  ${overlay}
  <div style="display:flex;position:absolute;left:56px;top:56px;background-color:${accentColor};border-radius:12px;padding:16px 28px">
    <div style="display:flex;color:${bgColor};font-size:34px;font-weight:700">${badge}</div>
  </div>
  <div style="display:flex;position:absolute;right:56px;top:56px;background-color:${bgColor};border-radius:12px;padding:16px 28px">
    <div style="display:flex;color:${accentColor};font-size:34px;font-weight:700">${price}</div>
  </div>
  <div style="display:flex;flex-direction:column;position:absolute;left:0;top:${BAND_HEIGHT}px;width:100%;height:${PANEL_HEIGHT}px;background-color:${bgColor};padding:56px 64px;justify-content:space-between">
    <div style="display:flex;flex-direction:column">
      <div style="display:flex;color:${textColor};font-size:56px;font-weight:700">${street}</div>
      <div style="display:flex;color:${mutedColor};font-size:36px;font-weight:400;margin-top:12px">${cityState}</div>
    </div>
    <div style="display:flex;width:100%;height:2px;background-color:${dividerColor}"></div>
    <div style="display:flex;flex-direction:row;justify-content:space-between">
      ${stat(beds, "Beds")}
      ${stat(baths, "Baths")}
      ${stat(sqft, "Sq Ft")}
    </div>
    <div style="display:flex;flex-direction:row;align-items:center;justify-content:space-between">
      <div style="display:flex;color:${textColor};font-size:32px;font-weight:700">${brokerage}</div>
      <div style="display:flex;color:${accentColor};font-size:32px;font-weight:400">${cta}</div>
    </div>
  </div>
</div>`;
}

/** A photo-only slide for the middle of a tour: image, caption, slide counter. */
function tourSlide({
  photo,
  caption = "",
  index = 1,
  total = 1,
  accentColor = "#F5B841",
  bgColor = "#101828",
  textColor = "#FFFFFF",
} = {}) {
  return `<div style="display:flex;position:relative;width:100%;height:100%;background-color:${bgColor};font-family:Inter">
  <img src="${normalised(photo, 1080, 1350)}" style="position:absolute;left:0;top:0;width:1080px;height:1350px;object-fit:cover" />
  <div style="display:flex;position:absolute;left:0;top:0;width:1080px;height:1350px;background:linear-gradient(180deg,rgba(16,24,40,0.45) 0%,rgba(16,24,40,0) 30%,rgba(16,24,40,0.85) 100%)"></div>
  <div style="display:flex;position:absolute;left:56px;top:56px;background-color:${bgColor};border-radius:12px;padding:14px 24px">
    <div style="display:flex;color:${accentColor};font-size:30px;font-weight:700">${index} / ${total}</div>
  </div>
  <div style="display:flex;flex-direction:column;position:absolute;left:0;bottom:0;width:1080px;padding:0 64px 190px 64px">
    <div style="display:flex;color:${textColor};font-size:60px;font-weight:700;line-height:1.15">${caption}</div>
  </div>
</div>`;
}

module.exports = { listingCard, tourSlide, normalised };
