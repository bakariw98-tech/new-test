/**
 * Checking a listing's photos before spending a render on them.
 *
 * This is the cheapest reliability win available here. Remotion's `<Img>` fails
 * the whole render rather than blanking — which is the behaviour we want — but
 * it fails *during* the render, so an expired Drive link costs a two-minute
 * sandbox and reports ninety seconds later. Probing first costs a couple of
 * seconds and answers the same question.
 *
 * The probe goes through `/api/image`, which is what the renderer fetches. That
 * matters: a Drive file can be perfectly real and still unreadable by us, and
 * only the proxied URL knows that. It also warms the immutable CDN cache, so
 * the render's own fetches become cache hits rather than duplicate conversions.
 *
 * An unreachable photo is dropped rather than fatal. Seven good photos still
 * make a video, and refusing to render one is a worse outcome for the agent
 * than rendering without a frame it never saw. Only a listing with nothing left
 * is fatal.
 */

import type { RenderContext } from "../core/types";
import { probeImages, type ImageProbe } from "../media/probe";
import { videoPhotoUrl } from "../renderers/carousel/plan";

export type PhotoPreflight = {
  /** The context to render, with unusable photos removed. */
  context: RenderContext;
  /** One line per dropped photo, recorded on the job so the agent sees it. */
  warnings: string[];
  /** Set when nothing usable is left. Do not render. */
  fatal?: string;
};

/**
 * `/api/image` answers a failure with `{ error, hint }`, and the hint is the
 * useful part — "the file must be shared so anyone with the link can view it"
 * is a fix, where "HTTP 502" is a shrug.
 */
function readDetail(body?: string): string | undefined {
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body) as { error?: unknown; hint?: unknown };
    const parts = [parsed.error, parsed.hint].filter(
      (part): part is string => typeof part === "string" && part.length > 0,
    );
    if (parts.length > 0) return parts.join(" ");
  } catch {
    // Not JSON — the raw body is still better than nothing, trimmed so a stray
    // HTML error page does not end up in a job record.
  }
  return body.replace(/\s+/g, " ").trim().slice(0, 160) || undefined;
}

function explain(probe: ImageProbe): string | null {
  if (probe.transportError) return `could not be fetched (${probe.transportError})`;

  if (!probe.ok) {
    const detail = readDetail(probe.detail);
    return detail ? `HTTP ${probe.status} — ${detail}` : `HTTP ${probe.status}`;
  }

  // /api/image always answers a success with image bytes. Anything else means
  // it fell through to an error shape we did not anticipate.
  const type = probe.contentType ?? "";
  if (type && !/^image\//i.test(type)) {
    return `served "${type}" rather than an image`;
  }

  return null;
}

export async function preflightVideoPhotos(
  context: RenderContext,
  opts?: { timeoutMs?: number },
): Promise<PhotoPreflight> {
  const probes = await probeImages(
    context.photos.map((photo) => videoPhotoUrl(context, photo.url)),
    // Generous: /api/image downloads and re-encodes a 4000px original on a cold
    // cache, and timing that out would drop a photo that is merely slow.
    { timeoutMs: opts?.timeoutMs ?? 20_000 },
  );

  const usable: RenderContext["photos"] = [];
  const warnings: string[] = [];

  context.photos.forEach((photo, i) => {
    const problem = explain(probes[i]);
    if (problem) {
      // The warning names the source the agent supplied, not the proxy URL it
      // has never seen.
      warnings.push(`Skipped photo ${i + 1} (${photo.url}): ${problem}.`);
    } else {
      usable.push(photo);
    }
  });

  if (usable.length === 0) {
    return {
      context,
      warnings,
      fatal: [
        "None of this listing's photos could be loaded, so there is nothing to render.",
        ...warnings,
        "",
        "For Google Drive, each file must be shared so anyone with the link can view it.",
      ].join("\n"),
    };
  }

  return { context: { ...context, photos: usable }, warnings };
}
