import { describe, expect, test } from "vitest";
import { contextFromRecord, resolveRenderContext } from "./context";
import { formatPrice } from "./format";
import { createMemoryStore, type ListingRecord } from "../store/listings";
import { THEMES } from "../design/tokens";
import type { BrandProfile, Listing, Photo } from "./types";

const listing: Listing = {
  id: "l1",
  accountId: "a1",
  slug: "1166-san-ysidro-dr",
  status: "published",
  street: "1166 San Ysidro Dr",
  city: "Beverly Hills",
  state: "CA",
  zip: "90210",
  priceCents: 849_500_000,
  beds: 5,
  bathsFull: 6,
  bathsHalf: 0,
  sqft: 5207,
  lotSqft: null,
  yearBuilt: 1962,
  description: "A canyon-view estate.",
  features: ["Pool", "Guest house"],
  mlsId: null,
  publishedAt: null,
};

const brand: BrandProfile = {
  accountId: "a1",
  agentUserId: null,
  logoUrl: null,
  headshotUrl: null,
  accentColor: null,
  headingFont: null,
  bodyFont: null,
  agentName: "Dana Reyes",
  agentTitle: "Principal",
  phone: "310-555-0142",
  email: "dana@aurora.example",
  brokerageName: "Aurora Estates",
  brokerageLicense: "DRE 01234567",
  instagram: "@auroraestates",
  facebook: null,
  linkedin: null,
  website: null,
  ctaText: "Book a showing",
  legalDisclaimer: "Equal Housing Opportunity.",
  defaultTheme: "minimal",
};

const photos: Photo[] = [
  { id: "p3", url: "https://example.com/c.jpg", sortOrder: 3, role: "gallery", width: null, height: null, alt: null },
  { id: "p1", url: "https://example.com/a.jpg", sortOrder: 1, role: "hero", width: null, height: null, alt: null },
  { id: "p2", url: "https://example.com/b.jpg", sortOrder: 2, role: "gallery", width: null, height: null, alt: null },
];

function record(over: Partial<ListingRecord> = {}): ListingRecord {
  return { listing, photos, brand, themeId: "minimal", updatedAt: "2026-08-01T00:00:00Z", ...over };
}

describe("contextFromRecord", () => {
  test("formats once, from the raw stored values", () => {
    const ctx = contextFromRecord(record());
    expect(ctx.formatted.price).toBe(formatPrice(listing.priceCents));
    expect(ctx.formatted.price).toBe("$8,495,000");
    expect(ctx.formatted.cityStateZip).toBe("Beverly Hills, CA 90210");
    expect(ctx.formatted.stats.map((s) => s.label)).toEqual(["Beds", "Baths", "Sq Ft"]);
  });

  test("photos come out in sort order regardless of how they were stored", () => {
    expect(contextFromRecord(record()).photos.map((p) => p.sortOrder)).toEqual([1, 2, 3]);
  });

  test("the site url points at the property page", () => {
    expect(contextFromRecord(record()).urls.site).toMatch(/\/p\/1166-san-ysidro-dr$/);
  });

  test("the theme is resolved for the website by default", () => {
    const ctx = contextFromRecord(record());
    expect(ctx.theme.color.bg).toBe(THEMES.minimal.color.bg);
    // Website base unit, not the carousel's — a 36px body would be enormous here.
    expect(ctx.theme.size.body).toBe(17);
  });

  test("switching the theme changes the whole palette with no other edit", () => {
    const minimal = contextFromRecord(record({ themeId: "minimal" }));
    const luxury = contextFromRecord(record({ themeId: "luxury" }));
    expect(luxury.theme.color.bg).not.toBe(minimal.theme.color.bg);
    expect(luxury.theme.color.accent).toBe(THEMES.luxury.color.accent);
    expect(luxury.theme.font.heading).toBe("Playfair Display");
  });

  test("a brand accent overrides the theme and keeps its text readable", () => {
    const ctx = contextFromRecord(
      record({ brand: { ...brand, accentColor: "#FF3B30" } }),
    );
    expect(ctx.theme.color.accent).toBe("#FF3B30");
    expect(ctx.theme.color.onAccent).not.toBe("#FF3B30");
  });

  test("the carousel medium yields larger absolute sizes from the same ratios", () => {
    const web = contextFromRecord(record(), { medium: "website" });
    const carousel = contextFromRecord(record(), { medium: "carousel" });
    expect(carousel.theme.size.body).toBe(36);
    expect(carousel.theme.size.h1 / carousel.theme.size.body).toBeCloseTo(
      web.theme.size.h1 / web.theme.size.body,
      2,
    );
  });
});

describe("resolveRenderContext", () => {
  test("reads through the store", async () => {
    const store = createMemoryStore();
    await store.save(record());
    const ctx = await resolveRenderContext("1166-san-ysidro-dr", { store });
    expect(ctx?.formatted.address).toBe("1166 San Ysidro Dr");
  });

  test("an unknown slug resolves to null so the page can 404", async () => {
    expect(await resolveRenderContext("nope", { store: createMemoryStore() })).toBeNull();
  });
});
