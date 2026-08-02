/**
 * Rendering video on Vercel, via Sandbox.
 *
 * Remotion's renderer cannot live inside a Vercel function — headless Chromium
 * and FFmpeg come to roughly 150 MB and blow the function size limit. (Duration
 * is not the problem; Pro allows 800s and the render measured 115s.) Sandbox
 * sidesteps it by spawning an ephemeral VM that already has the renderer on it,
 * so nothing heavy is ever in the function.
 *
 * The flow is: create a sandbox, copy the bundle in, start the render detached,
 * and poll. Detached is what makes this fit a request at all — the call returns
 * a handle as soon as rendering begins rather than waiting minutes for a file.
 */

import { getBundle } from "./render";
import type { VideoId } from "./render";

/**
 * How long a detached sandbox may live, and the only cost control available.
 *
 * A detached sandbox cannot be stopped early. `Sandbox.stop()` needs an
 * instance, `Sandbox.get()` looks up by *name*, and `createSandbox()` does not
 * accept one — so given only the `sandboxId` a render returns, there is no
 * handle to stop. The sandbox runs until this timeout regardless of when the
 * render actually finishes.
 *
 * Remotion's default is 30 minutes against a render measured at two, which is
 * up to 28 minutes of a VM billing for nothing. Eight leaves room for a slow
 * or long listing while capping the waste at roughly six minutes per render.
 *
 * Raise it if a 20-photo listing ever reports `expired` — that failure mode is
 * this number being too small, and it is worth watching on the first few real
 * renders.
 */
const DETACHED_TIMEOUT_MS = 8 * 60 * 1000;

/** Memory scales at 2048 MB per vCPU. Remotion parallelises frames across cores. */
const VCPUS = 4;

export type VercelRenderHandle = { sandboxId: string; cmdId: string };

export type VercelRenderProgress = {
  /** 0-100. */
  progress: number;
  /** What the renderer is doing, for a human reading a poll response. */
  stage: string;
  done: boolean;
  outputUrl?: string;
  error?: string;
};

export function vercelRenderConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Creates the sandbox, uploads the bundle, and starts the render.
 *
 * This is slow — sandbox creation installs system libraries and a browser — so
 * it must not be awaited inside a request that a person is waiting on. The job
 * runner calls it from `after()`, which keeps the function alive past the
 * response.
 */
export async function startVercelRender(params: {
  id: VideoId;
  props: Record<string, unknown>;
  onSetupProgress?: (message: string) => void;
}): Promise<VercelRenderHandle> {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not set. A detached Sandbox render writes its output straight to Blob, so it cannot run without one.",
    );
  }

  const { createSandbox, addBundleToSandbox, renderMediaOnVercel } = await import(
    "@remotion/vercel"
  );

  // The same bundle the local renderer uses, memoised per process.
  const bundleDir = await getBundle();

  const sandbox = await createSandbox({
    resources: { vcpus: VCPUS },
    onProgress: ({ message }) => {
      params.onSetupProgress?.(message);
    },
  });

  try {
    await addBundleToSandbox({ sandbox, bundleDir });

    const { sandboxId, cmdId } = await renderMediaOnVercel({
      sandbox,
      compositionId: params.id,
      inputProps: params.props,
      detached: true,
      codec: "h264",
      // Visually lossless for photography. The default trades away detail in
      // exactly the gradients these scenes are built from.
      crf: 18,
      detachedSandboxTimeoutInMilliseconds: DETACHED_TIMEOUT_MS,
      vercelBlob: { blobToken, access: "public" },
    });

    return { sandboxId, cmdId };
  } catch (error) {
    // The sandbox exists but no render was started on it, so nothing will ever
    // report progress and only the creation timeout will reclaim it. Here the
    // instance is still in hand, which is the one moment stopping is possible.
    await sandbox.stop().catch(() => undefined);
    throw error;
  }
}

export async function pollVercelRender(
  handle: VercelRenderHandle,
): Promise<VercelRenderProgress> {
  const { getRenderProgress } = await import("@remotion/vercel");
  const progress = await getRenderProgress(handle);

  // `overallProgress` is 0-1 on every stage that reports it.
  const percent = (p: { overallProgress?: number }) =>
    Math.round(Math.min(1, Math.max(0, p.overallProgress ?? 0)) * 100);

  switch (progress.stage) {
    case "done":
      return { progress: 100, stage: "done", done: true, outputUrl: progress.url };

    case "error":
      return { progress: percent(progress), stage: "error", done: true, error: progress.message };

    case "expired":
      return {
        progress: 0,
        stage: "expired",
        done: true,
        error:
          "The render sandbox expired before finishing. Start the render again; if this repeats, the video is taking longer than the sandbox timeout allows.",
      };

    case "render-progress":
      return { progress: percent(progress), stage: "rendering", done: false };

    default:
      return { progress: percent(progress), stage: progress.stage, done: false };
  }
}

