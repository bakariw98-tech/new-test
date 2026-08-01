/**
 * Every display decision, in one place.
 *
 * If a price renders as "$8,495,000" on the carousel it must render the same on
 * the website and the flyer. The only way to guarantee that is for no renderer
 * to be allowed to format anything — they read `context.formatted`, which is
 * built here once.
 */

import type { BrandProfile, Listing, Stat } from "./types";

/** "$8,495,000" — no cents, because listing prices are never fractional. */
export function formatPrice(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

/** "$8.5M" / "$850K" — for tight spots like a QR card or a story overlay. */
export function formatPriceShort(cents: number): string {
  const dollars = Math.round(cents / 100);
  if (dollars >= 1_000_000) {
    const millions = dollars / 1_000_000;
    // 8.5M reads better than 8.50M; 12M better than 12.0M.
    return `$${millions >= 10 ? Math.round(millions) : trimZero(millions.toFixed(1))}M`;
  }
  if (dollars >= 1_000) return `$${Math.round(dollars / 1_000)}K`;
  return `$${dollars.toLocaleString("en-US")}`;
}

function trimZero(value: string): string {
  return value.endsWith(".0") ? value.slice(0, -2) : value;
}

/** "5,207" — plain thousands separator. */
export function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

/**
 * "3" for three full baths, "3.5" when there is also a half.
 * Half baths are counted separately in the schema because MLS data does, and
 * collapsing them early loses the distinction agents care about.
 */
export function formatBaths(full: number, half: number): string {
  return half > 0 ? `${full}.5` : String(full);
}

export function formatAddress(listing: Listing): string {
  return listing.street;
}

export function formatCityStateZip(listing: Listing): string {
  const cityState = [listing.city, listing.state].filter(Boolean).join(", ");
  return [cityState, listing.zip].filter(Boolean).join(" ");
}

export function formatFullAddress(listing: Listing): string {
  return [formatAddress(listing), formatCityStateZip(listing)].filter(Boolean).join(", ");
}

/**
 * The stat row. Square footage is omitted rather than shown as a dash when the
 * listing does not have it — an empty column reads as missing data, which makes
 * the whole asset look unfinished.
 */
export function buildStats(listing: Listing): Stat[] {
  const stats: Stat[] = [
    { label: "Beds", value: String(listing.beds) },
    { label: "Baths", value: formatBaths(listing.bathsFull, listing.bathsHalf) },
  ];
  if (listing.sqft && listing.sqft > 0) {
    stats.push({ label: "Sq Ft", value: formatNumber(listing.sqft) });
  }
  return stats;
}

/** "AURORA ESTATES" — uppercased brokerage, the mark carried on every asset. */
export function formatBrandMark(brand: BrandProfile): string {
  return brand.brokerageName.toUpperCase();
}

/**
 * The line that keeps the customer compliant. Most jurisdictions require
 * brokerage attribution on advertised listings, and many require the licence
 * number alongside it, so this is appended to captions and rendered on every
 * asset rather than left to the agent to remember.
 */
export function formatAttribution(brand: BrandProfile): string {
  const parts = [brand.brokerageName];
  if (brand.brokerageLicense) parts.push(`Lic. ${brand.brokerageLicense}`);
  const line = parts.join(" · ");
  return brand.legalDisclaimer ? `${line}\n${brand.legalDisclaimer}` : line;
}

/**
 * "1166 San Ysidro Dr" -> "1166-san-ysidro-dr".
 * Collision handling belongs to the caller, which is the only place that can
 * see the other slugs in the account.
 */
export function slugifyAddress(street: string): string {
  return street
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Everything under `RenderContext.formatted`, derived in one pass. */
export function buildFormatted(listing: Listing, brand: BrandProfile) {
  return {
    price: formatPrice(listing.priceCents),
    priceShort: formatPriceShort(listing.priceCents),
    address: formatAddress(listing),
    cityStateZip: formatCityStateZip(listing),
    fullAddress: formatFullAddress(listing),
    beds: String(listing.beds),
    baths: formatBaths(listing.bathsFull, listing.bathsHalf),
    sqft: listing.sqft ? formatNumber(listing.sqft) : "",
    stats: buildStats(listing),
    brandMark: formatBrandMark(brand),
    attribution: formatAttribution(brand),
  };
}
