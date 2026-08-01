import { describe, expect, test } from "vitest";
import {
  buildFormatted,
  buildStats,
  formatAttribution,
  formatBaths,
  formatCityStateZip,
  formatPrice,
  formatPriceShort,
  slugifyAddress,
} from "./format";
import type { BrandProfile, Listing } from "./types";

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
  lotSqft: 21_780,
  yearBuilt: 1962,
  description: "A canyon-view estate.",
  features: ["Pool", "Guest house"],
  mlsId: "24-123456",
  publishedAt: "2026-08-01T00:00:00Z",
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
  ctaText: "DM to book a showing",
  legalDisclaimer: "Equal Housing Opportunity.",
  defaultTheme: "minimal",
};

describe("price", () => {
  test("renders whole dollars with separators", () => {
    expect(formatPrice(849_500_000)).toBe("$8,495,000");
    expect(formatPrice(0)).toBe("$0");
  });

  test("short form trims a trailing zero and switches unit by magnitude", () => {
    expect(formatPriceShort(849_500_000)).toBe("$8.5M");
    expect(formatPriceShort(200_000_000)).toBe("$2M");
    expect(formatPriceShort(1_240_000_000)).toBe("$12M");
    expect(formatPriceShort(85_000_000)).toBe("$850K");
    expect(formatPriceShort(50_000)).toBe("$500");
  });
});

describe("baths", () => {
  test("adds .5 only when a half bath exists", () => {
    expect(formatBaths(6, 0)).toBe("6");
    expect(formatBaths(3, 1)).toBe("3.5");
  });
});

describe("stats", () => {
  test("omits square footage rather than showing a placeholder", () => {
    expect(buildStats(listing).map((s) => s.label)).toEqual(["Beds", "Baths", "Sq Ft"]);
    expect(buildStats({ ...listing, sqft: null }).map((s) => s.label)).toEqual(["Beds", "Baths"]);
    expect(buildStats({ ...listing, sqft: 0 }).map((s) => s.label)).toEqual(["Beds", "Baths"]);
  });
});

describe("address", () => {
  test("joins city, state and zip", () => {
    expect(formatCityStateZip(listing)).toBe("Beverly Hills, CA 90210");
  });

  test("drops empty parts instead of leaving stray punctuation", () => {
    expect(formatCityStateZip({ ...listing, zip: "" })).toBe("Beverly Hills, CA");
    expect(formatCityStateZip({ ...listing, city: "", state: "", zip: "90210" })).toBe("90210");
  });
});

describe("slug", () => {
  test("lowercases and hyphenates", () => {
    expect(slugifyAddress("1166 San Ysidro Dr")).toBe("1166-san-ysidro-dr");
  });

  test("strips punctuation and accents without leaving edge hyphens", () => {
    expect(slugifyAddress("  #4 Cañada Blvd., Apt 2  ")).toBe("4-canada-blvd-apt-2");
  });
});

describe("attribution", () => {
  test("carries brokerage, licence and disclaimer", () => {
    expect(formatAttribution(brand)).toBe(
      "Aurora Estates · Lic. DRE 01234567\nEqual Housing Opportunity.",
    );
  });

  test("degrades cleanly when optional fields are absent", () => {
    expect(formatAttribution({ ...brand, brokerageLicense: null, legalDisclaimer: null })).toBe(
      "Aurora Estates",
    );
  });
});

test("buildFormatted produces every field a renderer reads", () => {
  const formatted = buildFormatted(listing, brand);
  expect(formatted).toMatchObject({
    price: "$8,495,000",
    priceShort: "$8.5M",
    address: "1166 San Ysidro Dr",
    cityStateZip: "Beverly Hills, CA 90210",
    fullAddress: "1166 San Ysidro Dr, Beverly Hills, CA 90210",
    beds: "5",
    baths: "6",
    sqft: "5,207",
    brandMark: "AURORA ESTATES",
  });
});
