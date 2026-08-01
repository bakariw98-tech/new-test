/**
 * Render jobs.
 *
 * A still renders in about a second and can answer a request inline. A video is
 * 570 frames and took two minutes on the machine this was measured on — it
 * cannot. So a video render returns a job id immediately and the caller polls.
 */

export type JobStatus = "queued" | "running" | "done" | "failed";

export type JobKind = "listing-video";

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
};

/**
 * Jobs are abandoned rather than cancelled: the process that owns a render has
 * no way to be interrupted mid-frame. Anything still "running" after this long
 * is treated as dead, because the alternative is a job that polls forever.
 */
export const STALE_AFTER_MS = 20 * 60 * 1000;

export function isStale(job: Job, now = Date.now()): boolean {
  if (job.status !== "running" && job.status !== "queued") return false;
  return now - new Date(job.updatedAt).getTime() > STALE_AFTER_MS;
}
