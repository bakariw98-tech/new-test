/**
 * Asking a URL whether it will actually serve an image, before something
 * expensive depends on the answer.
 *
 * Two callers want this and they want different sentences about it: the Satori
 * linter explains that a broken image is silently omitted, while the video
 * preflight explains that it costs a two-minute render. So this returns facts —
 * status, content type, whatever the server said — and lets each caller phrase
 * its own message.
 */

export type ImageProbe = {
  url: string;
  ok: boolean;
  status?: number;
  contentType?: string;
  /** Set when the request never produced a response at all (DNS, timeout, TLS). */
  transportError?: string;
  /** The start of an error response body, where the server explained itself. */
  detail?: string;
};

/** Enough of an error body to carry a sentence, not enough to carry a page. */
const DETAIL_LIMIT = 400;

export async function probeImage(url: string, timeoutMs = 8000): Promise<ImageProbe> {
  let response: Response;
  try {
    response = await fetch(url, {
      // One byte is enough to learn the status and the content type. A server
      // that ignores Range sends the whole body anyway, which is why the body is
      // explicitly cancelled below rather than left for the collector.
      method: "GET",
      headers: { Range: "bytes=0-0" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return {
      url,
      ok: false,
      transportError: error instanceof Error ? error.message : String(error),
    };
  }

  const status = response.status;
  const contentType = response.headers.get("content-type") ?? undefined;

  if (response.ok || status === 206) {
    await response.body?.cancel().catch(() => undefined);
    return { url, ok: true, status, contentType };
  }

  // A failing server usually explains itself in the body, and that explanation
  // is worth far more than the number: /api/image answers a private Drive file
  // with the actual fix, where the status alone is an unhelpful 502.
  let detail: string | undefined;
  try {
    detail = (await response.text()).slice(0, DETAIL_LIMIT) || undefined;
  } catch {
    // A body that cannot be read tells us nothing extra; the status still does.
  }

  return { url, ok: false, status, contentType, detail };
}

/**
 * Probes several URLs at once, bounded.
 *
 * Unbounded `Promise.all` over a 20-photo listing opens 20 sockets against one
 * host, which is the sort of thing that gets a server to start refusing — and a
 * preflight that causes the failure it is checking for is worse than no
 * preflight.
 */
export async function probeImages(
  urls: string[],
  opts?: { timeoutMs?: number; concurrency?: number },
): Promise<ImageProbe[]> {
  const limit = Math.max(1, opts?.concurrency ?? 6);
  const results = new Array<ImageProbe>(urls.length);
  let next = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, urls.length) }, async () => {
      for (let i = next++; i < urls.length; i = next++) {
        results[i] = await probeImage(urls[i], opts?.timeoutMs);
      }
    }),
  );

  return results;
}
