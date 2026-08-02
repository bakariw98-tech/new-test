/**
 * Renders a slide by running the Remotion composition in a real browser.
 *
 * The reason this replaces Satori: Satori implements a subset of CSS, so a
 * designer had to work inside a list of ~30 restrictions and the carousel could
 * never share components with the website or the PDF. Here it is Chromium, so
 * grid, masks, blend modes, real fonts and shadows all work, and a slide is an
 * ordinary React component.
 *
 * Bundling is the expensive step (seconds), not rendering, so the bundle is
 * built once per process and reused. On a long-lived server that cost is paid
 * at boot. In a short-lived serverless function it would be paid per cold start,
 * which is the main argument for running this somewhere always-on.
 */

import path from "node:path";
import os from "node:os";
import { readFile, rm } from "node:fs/promises";

export type SlideId = "ListingCard" | "TourSlide" | "ClosingSlide";

export type VideoId = "ListingVideo-9x16" | "ListingVideo-16x9";

let bundlePromise: Promise<string> | null = null;

/**
 * Remotion ships its own headless shell, but this environment already has a
 * Chromium that is known to work. Preferring it avoids a download at render
 * time and keeps the first render fast.
 */
function browserExecutable(): string | null {
  return process.env.REMOTION_BROWSER_EXECUTABLE ?? process.env.CHROMIUM_PATH ?? null;
}

export async function getBundle(): Promise<string> {
  if (!bundlePromise) {
    bundlePromise = (async () => {
      const { bundle } = await import("@remotion/bundler");
      return bundle({
        entryPoint: path.join(process.cwd(), "remotion", "index.ts"),
        // Keep webpack's own logging out of the render path.
        onProgress: () => undefined,
      });
    })();
  }
  return bundlePromise;
}

export async function renderSlide(params: {
  id: SlideId;
  props: Record<string, unknown>;
  scale?: number;
}): Promise<Uint8Array> {
  const { selectComposition, renderStill } = await import("@remotion/renderer");
  const serveUrl = await getBundle();

  const composition = await selectComposition({
    serveUrl,
    id: params.id,
    inputProps: params.props,
  });

  const output = path.join(
    await import("node:fs/promises").then((fs) => fs.mkdtemp(path.join(os.tmpdir(), "slide-"))),
    "slide.png",
  );

  try {
    await renderStill({
      composition,
      serveUrl,
      output,
      inputProps: params.props,
      imageFormat: "png",
      scale: params.scale ?? 1,
      browserExecutable: browserExecutable() ?? undefined,
      chromiumOptions: { gl: "swangle" },
      // Without this a slow photo can be captured mid-load, which shows up as a
      // blank panel rather than an error.
      timeoutInMilliseconds: 60_000,
    });

    const bytes = await readFile(output);
    // A fresh zero-offset copy: a Buffer view can make Response stringify the
    // payload, which has already cost this codebase two debugging rounds.
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy;
  } finally {
    await rm(path.dirname(output), { recursive: true, force: true });
  }
}

/**
 * Renders the listing video.
 *
 * The composition's own `calculateMetadata` derives the duration from the photo
 * count, so `selectComposition` is what decides how long this runs — not the
 * caller. That keeps the length rule in one place.
 *
 * A 20-second video is 600 frames against a still's one, so this is minutes of
 * work in the worst case, not seconds. It belongs in a background job, never
 * inline in a request.
 */
export async function renderVideo(params: {
  id: VideoId;
  props: Record<string, unknown>;
  onProgress?: (percent: number) => void;
}): Promise<{ bytes: Uint8Array; durationInFrames: number; fps: number }> {
  const { selectComposition, renderMedia } = await import("@remotion/renderer");
  const serveUrl = await getBundle();

  const composition = await selectComposition({
    serveUrl,
    id: params.id,
    inputProps: params.props,
  });

  const dir = await import("node:fs/promises").then((fs) =>
    fs.mkdtemp(path.join(os.tmpdir(), "listing-video-")),
  );
  const output = path.join(dir, "video.mp4");

  try {
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: output,
      inputProps: params.props,
      // 18 is visually lossless for photography; the default trades away detail
      // in exactly the gradients these scenes are built from.
      crf: 18,
      browserExecutable: browserExecutable() ?? undefined,
      chromiumOptions: { gl: "swangle" },
      timeoutInMilliseconds: 120_000,
      onProgress: params.onProgress
        ? ({ progress }) => params.onProgress?.(Math.round(progress * 100))
        : undefined,
    });

    const bytes = await readFile(output);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return { bytes: copy, durationInFrames: composition.durationInFrames, fps: composition.fps };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
