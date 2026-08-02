/**
 * Running a video render as a background job.
 *
 * The measured render was roughly two minutes for 570 frames, so no request
 * waits for one: `startVideoJob` records the job, gets the render moving, and
 * returns a handle to poll.
 *
 * Two hosts, two strategies. On Vercel the renderer cannot live in the function
 * at all — Chromium and FFmpeg exceed the function size limit — so the work
 * goes to a Vercel Sandbox and progress is polled from it. Anywhere long-lived,
 * rendering in-process is simpler and needs no cloud account.
 */

import { randomUUID } from "node:crypto";
import { uploadRender } from "../../app/api/render/store";
import { resolveRenderContext } from "../core/context";
import type { RenderContext } from "../core/types";
import { planVideo } from "../renderers/carousel/plan";
import { renderVideo, type VideoId } from "../renderers/remotion/render";
import { preflightVideoPhotos } from "./preflight";
import { jobStore, throttledProgress } from "./store";
import type { Job } from "./types";

export const VIDEO_VARIANTS = ["ListingVideo-9x16", "ListingVideo-16x9"] as const;

/**
 * How many times starting a render may be tried.
 *
 * Two, not more. Setup takes the better part of a minute and it all happens
 * inside one function invocation capped at five, so a third attempt risks being
 * cut off partway and leaving a sandbox nobody polls. One retry covers the
 * failure this exists for — a transient refusal from the sandbox API — and
 * anything that fails twice is not transient.
 */
const MAX_SETUP_ATTEMPTS = 2;

const RETRY_BACKOFF_MS = 3000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Whether starting the render is worth trying again.
 *
 * The distinction that matters is transient versus deterministic. A sandbox the
 * API declined to create may well be created a moment later; a composition that
 * does not exist will not start existing. Retrying the second kind spends
 * another minute to reach the same answer, which is how a clear error message
 * turns into a slow one.
 *
 * Deliberately conservative in the other direction too: an unrecognised error
 * is treated as retryable, because the cost of one extra attempt is a minute
 * and the cost of not retrying a flake is a failed render in front of a
 * customer.
 */
export function isRetryableSetupError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();

  // Deterministic for this input — the same attempt produces the same failure.
  if (
    /blob_read_write_token|no composition|cannot find composition|could not find the composition|out of memory|enoent|no such file/.test(
      message,
    )
  ) {
    return false;
  }

  return true;
}

export async function startVideoJob(params: {
  slug: string;
  variant: VideoId;
}): Promise<Job> {
  const store = jobStore();
  const now = new Date().toISOString();

  const job: Job = {
    id: randomUUID(),
    kind: "listing-video",
    status: "queued",
    slug: params.slug,
    variant: params.variant,
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };

  await store.save(job);

  const work = (renderStrategy() === "sandbox" ? startSandboxJob(job) : runVideoJob(job)).catch(
    async (error) => {
      await store.save({
        ...job,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        updatedAt: new Date().toISOString(),
      });
    },
  );

  if (renderStrategy() === "sandbox") {
    // Creating a sandbox installs a browser and takes tens of seconds, which is
    // far too long to hold an MCP call open. `after()` keeps the function alive
    // past the response so the setup completes — a plain floating promise would
    // be killed the moment the response is sent.
    const { after } = await import("next/server");
    after(work);
  } else {
    // A long-lived process can simply keep running.
    void work;
  }

  return job;
}

/**
 * Where the render actually happens.
 *
 * On Vercel the renderer cannot live in the function — Chromium and FFmpeg
 * exceed the function size limit — so the work goes to a Sandbox and progress
 * is polled. Anywhere else, rendering in-process is simpler and is what makes
 * `npm run dev` work with no cloud account at all.
 */
function renderStrategy(): "sandbox" | "in-process" {
  return process.env.VERCEL ? "sandbox" : "in-process";
}

type Prepared = { context: RenderContext; warnings: string[] };

/**
 * Everything that must be true before a render is worth starting.
 *
 * All three checks are cheap and all three catch failures that would otherwise
 * surface a minute or two into a render that has already been paid for.
 * Returns null having already recorded the failure, so callers just stop.
 */
async function prepare(job: Job): Promise<Prepared | null> {
  const store = jobStore();
  const fail = async (error: string): Promise<null> => {
    await store.save({ ...job, status: "failed", error, updatedAt: new Date().toISOString() });
    return null;
  };

  const context = await resolveRenderContext(job.slug, { medium: "carousel" });
  if (!context) {
    return fail(
      `No listing named "${job.slug}". Publish it first, or check list_listings for the right slug.`,
    );
  }

  if (context.photos.length === 0) {
    return fail("That listing has no photos, so there is nothing to make a video from.");
  }

  const preflight = await preflightVideoPhotos(context);
  if (preflight.fatal) return fail(preflight.fatal);

  return { context: preflight.context, warnings: preflight.warnings };
}

/**
 * Hands the render to a Vercel Sandbox and records the handle.
 *
 * Nothing is awaited beyond the point the render *starts*: the sandbox keeps
 * going after this function returns, and `get_render_job` polls it.
 */
async function startSandboxJob(job: Job): Promise<void> {
  const store = jobStore();

  const prepared = await prepare(job);
  if (!prepared) return;

  // Carried into every subsequent write. Spreading the original `job` would
  // quietly drop the preflight warnings on the next save.
  const base: Job = {
    ...job,
    warnings: prepared.warnings.length > 0 ? prepared.warnings : undefined,
  };

  const props = planVideo(prepared.context) as unknown as Record<string, unknown>;
  const { startVercelRender } = await import("../renderers/remotion/vercel");

  for (let attempt = 1; attempt <= MAX_SETUP_ATTEMPTS; attempt++) {
    await store.save({
      ...base,
      status: "running",
      attempts: attempt,
      updatedAt: new Date().toISOString(),
    });

    try {
      const handle = await startVercelRender({ id: job.variant as VideoId, props });
      await store.save({
        ...base,
        status: "running",
        attempts: attempt,
        sandbox: handle,
        updatedAt: new Date().toISOString(),
      });
      return;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const lastAttempt = attempt === MAX_SETUP_ATTEMPTS;

      if (lastAttempt || !isRetryableSetupError(error)) {
        await store.save({
          ...base,
          status: "failed",
          attempts: attempt,
          error:
            attempt > 1
              ? `Could not start the render after ${attempt} attempts: ${reason}`
              : `Could not start the render: ${reason}`,
          updatedAt: new Date().toISOString(),
        });
        return;
      }

      await delay(RETRY_BACKOFF_MS * attempt);
    }
  }
}

/**
 * Brings a sandbox-backed job up to date by asking Remotion where it is.
 *
 * Progress is pulled on read rather than pushed: a job nobody polls costs
 * nothing to track, and the renderer is on another machine anyway.
 */
export async function refreshJob(job: Job): Promise<Job> {
  if (!job.sandbox || job.status === "done" || job.status === "failed") return job;

  const { pollVercelRender } = await import("../renderers/remotion/vercel");
  const store = jobStore();

  try {
    const progress = await pollVercelRender(job.sandbox);
    const updated: Job = {
      ...job,
      progress: progress.progress,
      status: progress.done ? (progress.error ? "failed" : "done") : "running",
      outputUrl: progress.outputUrl ?? job.outputUrl,
      error: progress.error,
      durationMs: progress.done
        ? Date.now() - new Date(job.createdAt).getTime()
        : job.durationMs,
      updatedAt: new Date().toISOString(),
    };
    await store.save(updated);
    return updated;
  } catch (error) {
    // A failed poll is not a failed render — the next one may well succeed, so
    // report what is known rather than condemning the job.
    return { ...job, error: error instanceof Error ? error.message : String(error) };
  }
}

async function runVideoJob(job: Job): Promise<void> {
  const store = jobStore();
  const started = Date.now();

  const prepared = await prepare(job);
  if (!prepared) return;

  const base: Job = {
    ...job,
    warnings: prepared.warnings.length > 0 ? prepared.warnings : undefined,
  };

  await store.save({ ...base, status: "running", updatedAt: new Date().toISOString() });

  const { bytes, durationInFrames, fps } = await renderVideo({
    id: job.variant as VideoId,
    props: planVideo(prepared.context) as unknown as Record<string, unknown>,
    onProgress: throttledProgress(base),
  });

  const outputUrl = await uploadRender(bytes, { extension: "mp4", contentType: "video/mp4" });

  await store.save({
    ...base,
    status: "done",
    progress: 100,
    outputUrl,
    durationMs: Date.now() - started,
    updatedAt: new Date().toISOString(),
  });

  // Seconds of finished video, useful when reasoning about render cost later.
  void (durationInFrames / fps);
}
