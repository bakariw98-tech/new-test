import { afterEach, describe, expect, test, vi } from "vitest";
import { contextFromRecord } from "../core/context";
import type { BrandProfile, Listing } from "../core/types";
import type { ListingRecord } from "../store/listings";
import { preflightVideoPhotos } from "./preflight";
import { isRetryableSetupError } from "./run";

const listing: Listing = {
  id: "l1",
  accountId: "a1",
  slug: "9541-sunset-blvd",
  status: "published",
  street: "9541 Sunset Blvd",
  city: "Beverly Hills",
  state: "CA",
  zip: "90210",
  priceCents: 2_450_000_000,
  beds: 8,
  bathsFull: 9,
  bathsHalf: 0,
  sqft: 9500,
  lotSqft: null,
  yearBuilt: null,
  description: "",
  features: [],
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
  agentTitle: null,
  phone: null,
  email: null,
  brokerageName: "Aurora Estates",
  brokerageLicense: null,
  instagram: "@auroraestates",
  facebook: null,
  linkedin: null,
  website: null,
  ctaText: "Book a showing",
  legalDisclaimer: null,
  defaultTheme: "luxury",
};

function record(photoUrls: string[]): ListingRecord {
  return {
    listing,
    photos: photoUrls.map((url, i) => ({
      id: `p${i}`,
      url,
      sortOrder: i,
      role: i === 0 ? ("hero" as const) : ("gallery" as const),
      width: null,
      height: null,
      alt: null,
    })),
    brand,
    themeId: "luxury",
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Answers each probed URL according to a map keyed by the original source.
 *
 * Each entry builds a fresh Response rather than cloning one: the probe cancels
 * the body it does not need, and cancelling one half of a cloned body deadlocks
 * against the half nobody reads.
 */
function stubFetch(byPhoto: Record<string, () => Response>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    for (const [photo, build] of Object.entries(byPhoto)) {
      if (url.includes(encodeURIComponent(photo)) || url.includes(photo)) return build();
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

const image = () =>
  new Response(new Uint8Array([0xff]), { status: 206, headers: { "content-type": "image/jpeg" } });

const missing = () =>
  Response.json(
    { error: "Source returned HTTP 404.", hint: "Share it with 'Anyone with the link'." },
    { status: 502 },
  );

afterEach(() => vi.restoreAllMocks());

describe("preflightVideoPhotos", () => {
  test("passes a listing whose photos all load, with nothing to report", async () => {
    stubFetch({ "https://x/a.jpg": image, "https://x/b.jpg": image });

    const result = await preflightVideoPhotos(
      contextFromRecord(record(["https://x/a.jpg", "https://x/b.jpg"])),
    );

    expect(result.fatal).toBeUndefined();
    expect(result.warnings).toEqual([]);
    expect(result.context.photos).toHaveLength(2);
  });

  test("drops an unreachable photo and renders the rest", async () => {
    // Seven good photos still make a video. Refusing to render because one
    // Drive link expired is a worse outcome than a video missing a frame the
    // agent never saw.
    stubFetch({ "https://x/a.jpg": image, "https://x/gone.jpg": missing });

    const result = await preflightVideoPhotos(
      contextFromRecord(record(["https://x/a.jpg", "https://x/gone.jpg"])),
    );

    expect(result.fatal).toBeUndefined();
    expect(result.context.photos.map((p) => p.url)).toEqual(["https://x/a.jpg"]);
    expect(result.warnings).toHaveLength(1);
    // The warning names the source the agent supplied, not the proxy URL.
    expect(result.warnings[0]).toContain("https://x/gone.jpg");
    // And carries the fix the image route already worked out.
    expect(result.warnings[0]).toContain("Anyone with the link");
  });

  test("a listing with no loadable photo is fatal rather than a blank video", async () => {
    stubFetch({ "https://x/gone.jpg": missing });

    const result = await preflightVideoPhotos(contextFromRecord(record(["https://x/gone.jpg"])));

    expect(result.fatal).toMatch(/none of this listing's photos could be loaded/i);
    expect(result.fatal).toContain("https://x/gone.jpg");
  });

  test("a photo that times out is dropped, not thrown", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("The operation was aborted"));

    const result = await preflightVideoPhotos(contextFromRecord(record(["https://x/slow.jpg"])));

    expect(result.fatal).toBeTruthy();
    expect(result.fatal).toContain("The operation was aborted");
  });
});

describe("isRetryableSetupError", () => {
  test("retries a transient refusal", () => {
    expect(isRetryableSetupError(new Error("fetch failed"))).toBe(true);
    expect(isRetryableSetupError(new Error("Sandbox creation timed out"))).toBe(true);
    expect(isRetryableSetupError(new Error("503 Service Unavailable"))).toBe(true);
  });

  test("does not spend a second attempt on a deterministic failure", () => {
    // Another minute to reach the same answer turns a clear error into a slow
    // one.
    expect(
      isRetryableSetupError(new Error("BLOB_READ_WRITE_TOKEN is not set.")),
    ).toBe(false);
    expect(isRetryableSetupError(new Error("Could not find the composition"))).toBe(false);
    expect(isRetryableSetupError(new Error("JavaScript heap out of memory"))).toBe(false);
  });
});
