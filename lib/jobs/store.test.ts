import { describe, expect, test } from "vitest";
import { createFileJobStore, createMemoryJobStore } from "./store";
import { isStale, SETUP_STALE_AFTER_MS, STALE_AFTER_MS, type Job } from "./types";

/** A job that has reached the point of having something to poll. */
const sandbox = { sandboxId: "sbx_1", cmdId: "cmd_1" };

function job(over: Partial<Job> = {}): Job {
  const now = new Date().toISOString();
  return {
    id: "j1",
    kind: "listing-video",
    status: "queued",
    slug: "9541-sunset-blvd",
    variant: "ListingVideo-9x16",
    progress: 0,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

describe("job store", () => {
  test("round-trips a job", async () => {
    const store = createMemoryJobStore();
    await store.save(job());
    expect((await store.get("j1"))?.slug).toBe("9541-sunset-blvd");
  });

  test("an unknown id is null rather than a throw", async () => {
    expect(await createMemoryJobStore().get("nope")).toBeNull();
  });

  test("progress updates replace rather than accumulate", async () => {
    const store = createMemoryJobStore();
    await store.save(job());
    await store.save(job({ status: "running", progress: 45 }));
    expect((await store.get("j1"))?.progress).toBe(45);
    expect(await store.list()).toHaveLength(1);
  });

  test("a finished job is left alone no matter how old", async () => {
    const store = createMemoryJobStore();
    const old = new Date(Date.now() - STALE_AFTER_MS * 5).toISOString();
    await store.save(job({ status: "done", outputUrl: "https://x/v.mp4", updatedAt: old }));
    const found = await store.get("j1");
    expect(found?.status).toBe("done");
    expect(found?.outputUrl).toBe("https://x/v.mp4");
  });

  test("a render that stopped reporting is surfaced as failed, not stuck", async () => {
    // Nothing can interrupt a render mid-frame, so a job whose owner was
    // recycled would otherwise be polled forever.
    const store = createMemoryJobStore();
    const stalled = new Date(Date.now() - STALE_AFTER_MS - 1000).toISOString();
    await store.save(job({ status: "running", progress: 30, updatedAt: stalled, sandbox }));

    const found = await store.get("j1");
    expect(found?.status).toBe("failed");
    expect(found?.error).toMatch(/presumed dead/i);
  });

  test("a job interrupted before it got a renderer fails in minutes, not twenty", async () => {
    // The failure this exists for: the function is recycled during setup, so
    // there is no sandbox to poll and nothing will ever update the record.
    const store = createMemoryJobStore();
    const stalled = new Date(Date.now() - SETUP_STALE_AFTER_MS - 1000).toISOString();
    await store.save(job({ status: "running", updatedAt: stalled }));

    const found = await store.get("j1");
    expect(found?.status).toBe("failed");
    expect(found?.error).toMatch(/never got as far as starting/i);
  });

  test("a recent running job is not touched", async () => {
    const store = createMemoryJobStore();
    await store.save(job({ status: "running", progress: 30 }));
    expect((await store.get("j1"))?.status).toBe("running");
  });

  test("the file store survives separate instances", async () => {
    // Route handlers and server components get separate module graphs, which is
    // why the memory store cannot back a real request.
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const dir = await mkdtemp(`${tmpdir()}/jobs-`);

    await createFileJobStore(dir).save(job({ status: "running", progress: 12 }));
    expect((await createFileJobStore(dir).get("j1"))?.progress).toBe(12);
  });
});

describe("isStale", () => {
  test("only applies to work that claims to be in flight", () => {
    const old = new Date(Date.now() - STALE_AFTER_MS - 1).toISOString();
    expect(isStale(job({ status: "running", updatedAt: old, sandbox }))).toBe(true);
    expect(isStale(job({ status: "queued", updatedAt: old }))).toBe(true);
    expect(isStale(job({ status: "done", updatedAt: old, sandbox }))).toBe(false);
    expect(isStale(job({ status: "failed", updatedAt: old, sandbox }))).toBe(false);
  });

  test("a sandbox render gets the long window, setup gets the short one", () => {
    // A sandbox job stops writing once it has a handle — progress is pulled on
    // read — so its window has to cover a whole render. Setup does not.
    const between = new Date(Date.now() - SETUP_STALE_AFTER_MS - 1000).toISOString();
    expect(isStale(job({ status: "running", updatedAt: between, sandbox }))).toBe(false);
    expect(isStale(job({ status: "running", updatedAt: between }))).toBe(true);
  });
});
