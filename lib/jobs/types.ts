/**
 * Render jobs.
 *
 * A still renders in about a second and can answer a request inline. A video is
 * 570 frames and took two minutes on the machine this was measured on — it
 * cannot. So a video render returns a job id immediately and the caller polls.
 */

export type JobStatus = "queued" | "running" | "done" | "failed";

/**
 * "benchmark-video" is temporary — it exists only to measure Sandbox render
 * time on a long, fast-cut composition and is not a feature; remove it (and
 * remotion/benchmark/, and render_benchmark_video in app/api/mcp/route.ts)
 * once that number is recorded.
 */
export type JobKind = "listing-video" | "benchmark-video";

export type Job = {
  id: string;
  kind: JobKind;
  status: JobStatus;
  /** Listing slug this job is rendering. */
  slug: string;
  /** Composition id, e.g. ListingVideo-9x16. */
  variant: string;
  /** 0-100. Only meaningful while running. */
  progress: number;
  /** Set once status is "done". */
  outputUrl?: string;
  /** Human-readable, set once status is "failed". */
  error?: string;
  createdAt: string;
  updatedAt: string;
  /** Milliseconds from start to finish, so cost can be reasoned about later. */
  durationMs?: number;
  /**
   * Set when the render is running in a Vercel Sandbox. Progress then comes
   * from polling Remotion rather than from the renderer pushing it here, so a
   * job nobody checks costs nothing to track.
   */
  sandbox?: { sandboxId: string; cmdId: string };
  /** How many times starting this render has been tried. */
  attempts?: number;
  /**
   * Non-fatal problems found before rendering — a photo that could not be
   * loaded and was skipped. The render still produced a video; the agent should
   * still be told what is missing from it.
   */
  warnings?: string[];
};

/**
 * Jobs are abandoned rather than cancelled: the process that owns a render has
 * no way to be interrupted mid-frame. Anything still "running" after this long
 * is treated as dead, because the alternative is a job that polls forever.
 */
export const STALE_AFTER_MS = 20 * 60 * 1000;

/**
 * The same rule, much tighter, for a job that has not reached the point of
 * having somewhere to poll.
 *
 * Setup — resolving the listing, probing photos, creating a sandbox, copying
 * the bundle in — measured under a minute, and the function it runs in is
 * capped at five. So a job with no sandbox handle after this long did not get
 * one and never will: the function was recycled mid-setup. Left on the
 * twenty-minute rule it sits "running" for nineteen minutes with nothing behind
 * it, which is the difference between a failure and a hang.
 */
export const SETUP_STALE_AFTER_MS = 5 * 60 * 1000;

/**
 * A sandbox job stops updating `updatedAt` once it has a handle — progress is
 * pulled on read — so its window has to cover a whole render. The in-process
 * path writes progress every few seconds and is comfortably inside either.
 */
export function staleAfter(job: Job): number {
  return job.sandbox ? STALE_AFTER_MS : SETUP_STALE_AFTER_MS;
}

export function isStale(job: Job, now = Date.now()): boolean {
  if (job.status !== "running" && job.status !== "queued") return false;
  return now - new Date(job.updatedAt).getTime() > staleAfter(job);
}
