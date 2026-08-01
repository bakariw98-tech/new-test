/**
 * Running a video render as a background job.
 *
 * The measured render was roughly two minutes for 570 frames. That is well past
 * what a serverless function will allow, so `startVideoJob` deliberately does
 * not await the work — it records the job, kicks the render off, and returns.
 *
 * That only actually completes on a host that outlives the request. On a
 * short-lived function the process is reclaimed mid-render and the job is left
 * running until the staleness window marks it failed. `renderHostWarning()`
 * says so up front rather than letting someone discover it from a job that
 * never finishes.
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
 * Vercel functions are capped well below a two-minute render. Anywhere else is
 * assumed to be long-lived until proven otherwise.
 */
export function renderHostWarning(): string | null {
  if (!process.env.VERCEL) return null;
  return [
    "This deployment runs on serverless functions, which are reclaimed long before a",
    "video render finishes — the job will start and then be marked failed once it stops",
    "reporting progress.",
    "",
    "Video rendering needs a host that stays alive for minutes: a small always-on box",
    "running this same code, or Remotion Lambda. Stills are unaffected and keep working",
    "inline.",
  ].join("\n");
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

  // Deliberately not awaited. Errors are recorded on the job rather than
  // thrown, because nothing is listening by the time they happen.
  void runVideoJob(job).catch(async (error) => {
    await store.save({
      ...job,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      updatedAt: new Date().toISOString(),
    });
  });

  return job;
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
