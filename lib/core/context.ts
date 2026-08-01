/**
 * Turns a stored listing into the one object every renderer consumes.
 *
 * Nothing downstream reads the store, formats a value, or picks a colour — the
 * property page, the carousel and anything added later all take a
 * `RenderContext` and nothing else.
 */

import { publicOrigin } from "../../app/api/render/store";
import { resolveTheme } from "../design/resolve";
import type { Medium } from "../design/tokens";
import { buildFormatted } from "./format";
import { listingStore, type ListingRecord, type ListingStore } from "../store/listings";
import type { RenderContext } from "./types";

export function siteUrl(slug: string): string {
  return `${publicOrigin()}/p/${slug}`;
}

/** Build a context from a record already in hand — pure, so it is testable. */
export function contextFromRecord(
  record: ListingRecord,
  opts?: { medium?: Medium },
): RenderContext {
  const { listing, photos, brand, themeId } = record;

  return {
    listing,
    photos: [...photos].sort((a, b) => a.sortOrder - b.sortOrder),
    brand,
    theme: resolveTheme({ themeId, brand, medium: opts?.medium ?? "website" }),
    formatted: buildFormatted(listing, brand),
    urls: {
      site: siteUrl(listing.slug),
      // Nothing generates a QR yet; the field stays so renderers can rely on it.
      qr: "",
    },
  };
}

/** null rather than a throw, so the page can call notFound() on a bad slug. */
export async function resolveRenderContext(
  slug: string,
  opts?: { medium?: Medium; store?: ListingStore },
): Promise<RenderContext | null> {
  const record = await (opts?.store ?? listingStore()).get(slug);
  return record ? contextFromRecord(record, opts) : null;
}
