import { beforeEach, describe, expect, test } from "vitest";
import {
  createFileStore,
  createMemoryStore,
  slugForListing,
  uniqueSlug,
  type ListingRecord,
  type ListingStore,
} from "./listings";
import { slugifyAddress } from "../core/format";
import type { BrandProfile, Listing } from "../core/types";

const baseListing: Listing = {
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
  bathsHalf: 1,
  sqft: 5207,
  lotSqft: 21_780,
  yearBuilt: 1962,
  description: "A canyon-view estate.",
  features: ["Pool"],
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
  instagram: null,
  facebook: null,
  linkedin: null,
  website: null,
  ctaText: "Book a showing",
  legalDisclaimer: null,
  defaultTheme: "minimal",
};

function record(overrides: Partial<Listing> = {}): ListingRecord {
  return {
    listing: { ...baseListing, ...overrides },
    photos: [],
    brand,
    themeId: "minimal",
    updatedAt: new Date().toISOString(),
  };
}

let store: ListingStore;
beforeEach(() => {
  store = createMemoryStore();
});

describe("round trip", () => {
  test("a saved listing comes back intact", async () => {
    await store.save(record());
    const found = await store.get("1166-san-ysidro-dr");
    expect(found?.listing.street).toBe("1166 San Ysidro Dr");
    expect(found?.listing.priceCents).toBe(849_500_000);
    expect(found?.brand.brokerageName).toBe("Aurora Estates");
  });

  test("a missing slug is null, not a throw", async () => {
    expect(await store.get("nope")).toBeNull();
  });

  test("saving the same slug replaces rather than duplicates", async () => {
    await store.save(record());
    await store.save(record({ priceCents: 799_000_000 }));
    expect((await store.get("1166-san-ysidro-dr"))?.listing.priceCents).toBe(799_000_000);
    expect(await store.list()).toHaveLength(1);
  });

  test("stored records are isolated from later mutation of the caller's object", async () => {
    const original = record();
    await store.save(original);
    original.listing.street = "mutated";
    expect((await store.get("1166-san-ysidro-dr"))?.listing.street).toBe("1166 San Ysidro Dr");
  });
});

describe("index", () => {
  test("list reflects saves and removals", async () => {
    await store.save(record());
    await store.save(record({ slug: "9-oak-ln", street: "9 Oak Ln" }));
    expect((await store.list()).map((s) => s.slug).sort()).toEqual([
      "1166-san-ysidro-dr",
      "9-oak-ln",
    ]);

    await store.remove("9-oak-ln");
    expect((await store.list()).map((s) => s.slug)).toEqual(["1166-san-ysidro-dr"]);
    expect(await store.get("9-oak-ln")).toBeNull();
  });

  test("removing a slug that was never there is not an error", async () => {
    await expect(store.remove("ghost")).resolves.toBeUndefined();
  });

  test("a file store skips objects that are not listings", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(`${tmpdir()}/listings-`);
    const fileStore = createFileStore(dir);

    await fileStore.save(record());
    // The retired index object, still present in existing buckets, parses fine
    // as JSON but has no .listing and used to crash the whole index.
    writeFileSync(`${dir}/_index.json`, JSON.stringify([{ slug: "stale" }]), "utf8");
    writeFileSync(`${dir}/broken.json`, "{not json", "utf8");

    expect((await fileStore.list()).map((s) => s.slug)).toEqual(["1166-san-ysidro-dr"]);
  });

  test("summaries carry what a listing index needs to display", async () => {
    await store.save(record());
    expect(await store.list()).toEqual([
      expect.objectContaining({
        slug: "1166-san-ysidro-dr",
        street: "1166 San Ysidro Dr",
        cityState: "Beverly Hills, CA",
      }),
    ]);
  });
});

describe("uniqueSlug", () => {
  test("returns the base when it is free", async () => {
    expect(await uniqueSlug(slugifyAddress("1166 San Ysidro Dr"), store)).toBe(
      "1166-san-ysidro-dr",
    );
  });

  test("two homes on the same street do not overwrite each other", async () => {
    await store.save(record());
    const next = await uniqueSlug(slugifyAddress("1166 San Ysidro Dr"), store);
    expect(next).toBe("1166-san-ysidro-dr-2");

    await store.save(record({ slug: next }));
    expect(await uniqueSlug(slugifyAddress("1166 San Ysidro Dr"), store)).toBe(
      "1166-san-ysidro-dr-3",
    );
  });

  test("an update keeps its own slug instead of being pushed to -2", async () => {
    await store.save(record());
    expect(
      await uniqueSlug("1166-san-ysidro-dr", store, { allow: "1166-san-ysidro-dr" }),
    ).toBe("1166-san-ysidro-dr");
  });

  test("an address that slugifies to nothing still gets a usable slug", async () => {
    expect(await uniqueSlug(slugifyAddress("!!!"), store)).toBe("listing");
  });
});

describe("slugForListing", () => {
  const bh = { street: "1166 San Ysidro Dr", city: "Beverly Hills", state: "CA" };

  test("a new address takes the base slug", async () => {
    expect(await slugForListing(store, bh)).toBe("1166-san-ysidro-dr");
  });

  test("republishing the same address updates it instead of duplicating", async () => {
    await store.save(record());
    expect(await slugForListing(store, bh)).toBe("1166-san-ysidro-dr");
  });

  test("address matching ignores case and surrounding whitespace", async () => {
    await store.save(record());
    expect(
      await slugForListing(store, {
        street: "  1166 san ysidro DR ",
        city: "beverly hills",
        state: "ca",
      }),
    ).toBe("1166-san-ysidro-dr");
  });

  test("the same street in a different city gets its own page", async () => {
    await store.save(record());
    const other = { street: "1166 San Ysidro Dr", city: "Palm Springs", state: "CA" };
    expect(await slugForListing(store, other)).toBe("1166-san-ysidro-dr-2");
  });

  test("that second city's listing then updates in place too", async () => {
    await store.save(record());
    const other = { street: "1166 San Ysidro Dr", city: "Palm Springs", state: "CA" };
    const slug = await slugForListing(store, other);
    await store.save(record({ slug, city: "Palm Springs" }));

    expect(await slugForListing(store, other)).toBe("1166-san-ysidro-dr-2");
    expect(await slugForListing(store, bh)).toBe("1166-san-ysidro-dr");
    expect(await store.list()).toHaveLength(2);
  });

  test("an explicit slug wins, so an address correction edits the right page", async () => {
    await store.save(record());
    expect(
      await slugForListing(store, { ...bh, street: "1168 San Ysidro Dr" }, "1166-san-ysidro-dr"),
    ).toBe("1166-san-ysidro-dr");
  });
});
