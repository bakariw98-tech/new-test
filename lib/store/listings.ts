/**
 * Where listings live.
 *
 * This is deliberately behind an interface. The current backing store is Vercel
 * Blob, which is enough to put a property on a real URL today without waiting on
 * a database. When Postgres arrives, only the adapter below changes — callers
 * (`lib/core/context.ts`, the MCP tools, the property page) never learn which
 * one they are talking to.
 *
 * Known limitation of the Blob adapter: objects are public. A listing that is
 * about to be published at /p/<slug> is fine, but a *draft* is not private here.
 * That is one of the reasons to move to Postgres, not a reason to avoid
 * shipping.
 */

import type { BrandProfile, Listing, Photo, ThemeId } from "../core/types";
import { slugifyAddress } from "../core/format";
import { blobConfigured } from "../../app/api/render/store";

export type ListingRecord = {
  listing: Listing;
  photos: Photo[];
  brand: BrandProfile;
  themeId: ThemeId;
  updatedAt: string;
};

export type ListingSummary = {
  slug: string;
  street: string;
  cityState: string;
  updatedAt: string;
};

export interface ListingStore {
  save(record: ListingRecord): Promise<void>;
  get(slug: string): Promise<ListingRecord | null>;
  list(): Promise<ListingSummary[]>;
  remove(slug: string): Promise<void>;
}

const PREFIX = "listings";
const INDEX_PATH = `${PREFIX}/_index.json`;

function recordPath(slug: string): string {
  return `${PREFIX}/${slug}.json`;
}

function summarise(record: ListingRecord): ListingSummary {
  return {
    slug: record.listing.slug,
    street: record.listing.street,
    cityState: [record.listing.city, record.listing.state].filter(Boolean).join(", "),
    updatedAt: record.updatedAt,
  };
}

/* -------------------------------------------------------------------------- */
/* Memory adapter                                                             */
/* -------------------------------------------------------------------------- */

/**
 * In-process only. Used by the tests, where a single module instance is
 * guaranteed and touching the filesystem would just be slower.
 *
 * Not suitable for serving requests: Next gives route handlers and server
 * components separate module graphs, so a listing written by the MCP route is
 * invisible to the page that renders it. `createFileStore` exists for that.
 */
export function createMemoryStore(): ListingStore {
  const records = new Map<string, ListingRecord>();

  return {
    async save(record) {
      records.set(record.listing.slug, structuredClone(record));
    },
    async get(slug) {
      const found = records.get(slug);
      return found ? structuredClone(found) : null;
    },
    async list() {
      return [...records.values()]
        .map(summarise)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async remove(slug) {
      records.delete(slug);
    },
  };
}

/**
 * Local development, when no Blob token is configured. One JSON file per
 * listing under `.listings/`, so a record survives both a restart and Next's
 * split module graphs.
 *
 * On Vercel this would be wrong — the filesystem is read-only apart from /tmp,
 * and /tmp is per-instance — which is why `listingStore()` only reaches for it
 * when Blob is unavailable and why the MCP tool warns in that case.
 */
export function createFileStore(dir: string): ListingStore {
  async function fs() {
    return import("node:fs/promises");
  }
  const file = (slug: string) => `${dir}/${slug}.json`;

  async function readAll(): Promise<ListingRecord[]> {
    const { readdir, readFile } = await fs();
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return [];
    }
    const records = await Promise.all(
      names
        .filter((n) => n.endsWith(".json"))
        .map(async (n) => {
          try {
            return JSON.parse(await readFile(`${dir}/${n}`, "utf8")) as ListingRecord;
          } catch {
            return null;
          }
        }),
    );
    return records.filter((r): r is ListingRecord => r !== null);
  }

  return {
    async save(record) {
      const { mkdir, writeFile } = await fs();
      await mkdir(dir, { recursive: true });
      await writeFile(file(record.listing.slug), JSON.stringify(record, null, 2), "utf8");
    },

    async get(slug) {
      const { readFile } = await fs();
      try {
        return JSON.parse(await readFile(file(slug), "utf8")) as ListingRecord;
      } catch {
        return null;
      }
    },

    async list() {
      return (await readAll()).map(summarise).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async remove(slug) {
      const { rm } = await fs();
      await rm(file(slug), { force: true });
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Blob adapter                                                               */
/* -------------------------------------------------------------------------- */

/**
 * One JSON object per listing, plus an index so `list()` is a single read
 * rather than a fan-out. Note this is NOT `uploadToBlob` from
 * app/api/render/store.ts — that one is content-addressed by SHA, which is
 * right for immutable PNGs and wrong for a record that gets edited.
 */
export function createBlobStore(): ListingStore {
  async function writeJson(pathname: string, value: unknown): Promise<void> {
    const { put } = await import("@vercel/blob");
    await put(pathname, JSON.stringify(value), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      // An edit has to be visible on the next page render, so no CDN caching.
      cacheControlMaxAge: 0,
    });
  }

  async function readJson<T>(pathname: string): Promise<T | null> {
    const { get } = await import("@vercel/blob");
    const result = await get(pathname, { access: "public", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return (await new Response(result.stream).json()) as T;
  }

  async function readIndex(): Promise<ListingSummary[]> {
    return (await readJson<ListingSummary[]>(INDEX_PATH)) ?? [];
  }

  async function writeIndex(entries: ListingSummary[]): Promise<void> {
    await writeJson(
      INDEX_PATH,
      [...entries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
  }

  return {
    async save(record) {
      await writeJson(recordPath(record.listing.slug), record);
      const summary = summarise(record);
      const entries = (await readIndex()).filter((e) => e.slug !== summary.slug);
      entries.push(summary);
      await writeIndex(entries);
    },

    async get(slug) {
      return readJson<ListingRecord>(recordPath(slug));
    },

    async list() {
      return readIndex();
    },

    async remove(slug) {
      const { del, BlobNotFoundError } = await import("@vercel/blob");
      try {
        await del(recordPath(slug));
      } catch (error) {
        // Deleting something already gone is the desired end state, not a failure.
        if (!(error instanceof BlobNotFoundError)) throw error;
      }
      await writeIndex((await readIndex()).filter((e) => e.slug !== slug));
    },
  };
}

/* -------------------------------------------------------------------------- */

export const BLOB_SETUP_HINT = [
  "No listing storage is configured, so there is nowhere to publish to.",
  "",
  "This deployment is serverless: its filesystem is read-only, and anything written",
  "to /tmp belongs to a single instance, so the next request would not see it.",
  "",
  "To fix, in the Vercel dashboard for this project:",
  "  1. Storage -> Create Database -> Blob",
  "  2. Connect it to this project (this sets BLOB_READ_WRITE_TOKEN automatically)",
  "  3. Redeploy",
  "",
  "Check it took effect at /api/health, which reports blob.configured.",
].join("\n");

/**
 * On a serverless deployment with no Blob token there is no durable place to
 * write. Failing here with the setup steps beats letting the filesystem throw
 * EROFS or ENOENT from somewhere deeper, which says nothing about the fix.
 *
 * Reads degrade to empty rather than throwing, so a property page renders its
 * not-found state instead of a 500.
 */
function createUnavailableStore(): ListingStore {
  const refuse = async (): Promise<never> => {
    throw new Error(BLOB_SETUP_HINT);
  };
  return { save: refuse, remove: refuse, async get() { return null; }, async list() { return []; } };
}

export type StoreKind = "blob" | "file" | "unavailable";

export function listingStoreKind(): StoreKind {
  if (blobConfigured()) return "blob";
  // VERCEL is set in every Vercel runtime, local `next dev` included only via
  // `vercel dev`; a plain dev server has a writable working directory.
  return process.env.VERCEL ? "unavailable" : "file";
}

let cached: ListingStore | null = null;

/** Blob when a token is configured, a local file store when one can be written. */
export function listingStore(): ListingStore {
  if (!cached) {
    const kind = listingStoreKind();
    cached =
      kind === "blob"
        ? createBlobStore()
        : kind === "file"
          ? createFileStore(`${process.cwd()}/.listings`)
          : createUnavailableStore();
  }
  return cached;
}

/** Test hook — drops the memoised adapter so env changes take effect. */
export function __resetListingStore(): void {
  cached = null;
}

/**
 * A slug that is not already taken. `slugifyAddress` gives the base; two homes
 * on the same street would otherwise overwrite each other.
 */
export async function uniqueSlug(
  base: string,
  store: ListingStore,
  opts?: { allow?: string },
): Promise<string> {
  if (!base) base = "listing";
  for (let n = 1; n < 100; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (candidate === opts?.allow) return candidate;
    if ((await store.get(candidate)) === null) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export type AddressKey = Pick<Listing, "street" | "city" | "state">;

function sameAddress(a: AddressKey, b: AddressKey): boolean {
  const norm = (v: string) => v.trim().toLowerCase();
  return norm(a.street) === norm(b.street) && norm(a.city) === norm(b.city) && norm(a.state) === norm(b.state);
}

/**
 * Which slug a published address should land on.
 *
 * Re-publishing the same address has to *update* that listing — an agent
 * correcting a price should not end up with two live pages, one of them wrong.
 * But two genuinely different properties can share a street name across cities
 * ("100 Main St" in two towns), and those must not overwrite each other. So the
 * base slug is reused only when the full address matches; otherwise this walks
 * to the next free suffix, still preferring an exact address match on the way.
 */
export async function slugForListing(
  store: ListingStore,
  address: AddressKey,
  explicitSlug?: string,
): Promise<string> {
  // An explicit slug means "edit this exact listing" and wins outright.
  if (explicitSlug) return explicitSlug;

  const base = slugifyAddress(address.street) || "listing";
  for (let n = 1; n < 100; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const existing = await store.get(candidate);
    if (existing === null) return candidate;
    if (sameAddress(existing.listing, address)) return candidate;
  }
  return `${base}-${Date.now()}`;
}
