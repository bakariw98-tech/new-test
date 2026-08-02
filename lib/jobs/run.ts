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
import { planVideo } from "../renderers/carousel/plan";
import { renderVideo, type VideoId } from "../renderers/remotion/render";
import { jobStore, throttledProgress } from "./store";
import type { Job } from "./types";

export const VIDEO_VARIANTS = ["ListingVideo-9x16", "ListingVideo-16x9"] as const;

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
 * Hands the render to a Vercel Sandbox and records the handle.
 *
 * Nothing is awaited beyond the point the render *starts*: the sandbox keeps
 * going after this function returns, and `get_render_job` polls it.
 */
async function startSandboxJob(job: Job): Promise<void> {
  const store = jobStore();

  const context = await resolveRenderContext(job.slug, { medium: "carousel" });
  if (!context) {
    await store.save({
      ...job,
      status: "failed",
      error: `No listing named "${job.slug}". Publish it first, or check list_listings for the right slug.`,
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  if (context.photos.length === 0) {
    await store.save({
      ...job,
      status: "failed",
      error: "That listing has no photos, so there is nothing to make a video from.",
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  const { startVercelRender } = await import("../renderers/remotion/vercel");

  await store.save({ ...job, status: "running", updatedAt: new Date().toISOString() });

  const handle = await startVercelRender({
    id: job.variant as VideoId,
    props: planVideo(context) as unknown as Record<string, unknown>,
  });

  await store.save({
    ...job,
    status: "running",
    sandbox: handle,
    updatedAt: new Date().toISOString(),
  });
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

  const context = await resolveRenderContext(job.slug, { medium: "carousel" });
  if (!context) {
    await store.save({
      ...job,
      status: "failed",
      error: `No listing named "${job.slug}". Publish it first, or check list_listings for the right slug.`,
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  if (context.photos.length === 0) {
    await store.save({
      ...job,
      status: "failed",
      error: "That listing has no photos, so there is nothing to make a video from.",
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  await store.save({ ...job, status: "running", updatedAt: new Date().toISOString() });

  const { bytes, durationInFrames, fps } = await renderVideo({
    id: job.variant as VideoId,
    props: planVideo(context) as unknown as Record<string, unknown>,
    onProgress: throttledProgress(job),
  });

  const outputUrl = await uploadRender(bytes, { extension: "mp4", contentType: "video/mp4" });

  await store.save({
    ...job,
    status: "done",
    progress: 100,
    outputUrl,
    durationMs: Date.now() - started,
    updatedAt: new Date().toISOString(),
  });

  // Seconds of finished video, useful when reasoning about render cost later.
  void (durationInFrames / fps);
}
