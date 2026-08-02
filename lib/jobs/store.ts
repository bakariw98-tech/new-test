/**
 * Where render jobs live.
 *
 * Same shape as the listing store, for the same reason: one interface, a Blob
 * adapter for deployments and a file adapter for local development, so moving
 * to Postgres later is one file.
 *
 * Progress updates are frequent, so writes are throttled — a 570-frame render
 * would otherwise put a few hundred objects through Blob for one video.
 */

import { blobConfigured } from "../../app/api/render/store";
import { isStale, type Job } from "./types";

const PREFIX = "jobs";

export interface JobStore {
  save(job: Job): Promise<void>;
  get(id: string): Promise<Job | null>;
  list(): Promise<Job[]>;
}

function jobPath(id: string): string {
  return `${PREFIX}/${id}.json`;
}

function isJob(value: unknown): value is Job {
  return typeof (value as Job | null)?.id === "string";
}

/** A job left running past the staleness window is reported as failed. */
function settle(job: Job): Job {
  if (!isStale(job)) return job;
  return {
    ...job,
    status: "failed",
    error: job.sandbox
      ? "The render stopped reporting progress and is presumed dead. This usually means the process that owned it was recycled mid-render — start it again on a host that stays alive long enough."
      : "The render never got as far as starting — setup was interrupted before a renderer was allocated, so nothing was ever running. Start it again; this one is transient and usually succeeds on the next attempt.",
  };
}

export function createMemoryJobStore(): JobStore {
  const jobs = new Map<string, Job>();
  return {
    async save(job) {
      jobs.set(job.id, structuredClone(job));
    },
    async get(id) {
      const found = jobs.get(id);
      return found ? settle(structuredClone(found)) : null;
    },
    async list() {
      return [...jobs.values()].map(settle).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  };
}

export function createFileJobStore(dir: string): JobStore {
  const file = (id: string) => `${dir}/${id}.json`;

  return {
    async save(job) {
      const { mkdir, writeFile } = await import("node:fs/promises");
      await mkdir(dir, { recursive: true });
      await writeFile(file(job.id), JSON.stringify(job, null, 2), "utf8");
    },
    async get(id) {
      const { readFile } = await import("node:fs/promises");
      try {
        const parsed = JSON.parse(await readFile(file(id), "utf8")) as unknown;
        return isJob(parsed) ? settle(parsed) : null;
      } catch {
        return null;
      }
    },
    async list() {
      const { readdir, readFile } = await import("node:fs/promises");
      let names: string[];
      try {
        names = await readdir(dir);
      } catch {
        return [];
      }
      const jobs = await Promise.all(
        names
          .filter((n) => n.endsWith(".json"))
          .map(async (n) => {
            try {
              return JSON.parse(await readFile(`${dir}/${n}`, "utf8")) as unknown;
            } catch {
              return null;
            }
          }),
      );
      return jobs.filter(isJob).map(settle).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  };
}

export function createBlobJobStore(): JobStore {
  return {
    async save(job) {
      const { put } = await import("@vercel/blob");
      await put(jobPath(job.id), JSON.stringify(job), {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 0,
      });
    },

    async get(id) {
      const { get } = await import("@vercel/blob");
      try {
        const result = await get(jobPath(id), { access: "public", useCache: false });
        if (!result || result.statusCode !== 200 || !result.stream) return null;
        const parsed = (await new Response(result.stream).json()) as unknown;
        return isJob(parsed) ? settle(parsed) : null;
      } catch {
        return null;
      }
    },

    async list() {
      const { list } = await import("@vercel/blob");
      const ids: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await list({ prefix: `${PREFIX}/`, cursor, limit: 1000 });
        for (const blob of page.blobs) {
          const name = blob.pathname.slice(PREFIX.length + 1);
          if (name.endsWith(".json")) ids.push(name.slice(0, -".json".length));
        }
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);

      const jobs = await Promise.all(ids.map((id) => this.get(id)));
      return jobs
        .filter((j): j is Job => j !== null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  };
}

let cached: JobStore | null = null;

export function jobStore(): JobStore {
  if (!cached) {
    cached = blobConfigured()
      ? createBlobJobStore()
      : createFileJobStore(`${process.cwd()}/.jobs`);
  }
  return cached;
}

export function __resetJobStore(): void {
  cached = null;
}

/**
 * Persists progress at most every few seconds. Without this a single video
 * render writes hundreds of objects, which costs money and buys nothing — the
 * caller polls far more slowly than the renderer reports.
 */
export function throttledProgress(job: Job, everyMs = 3000): (percent: number) => void {
  let last = 0;
  const store = jobStore();
  return (percent: number) => {
    const now = Date.now();
    if (percent < 100 && now - last < everyMs) return;
    last = now;
    void store.save({ ...job, status: "running", progress: percent, updatedAt: new Date().toISOString() });
  };
}
