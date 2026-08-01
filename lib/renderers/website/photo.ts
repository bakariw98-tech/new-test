/**
 * Photo URLs for the website.
 *
 * Everything goes through /api/image, the same normaliser the carousel uses. It
 * converts WebP and AVIF (which browsers handle but Satori cannot), resizes
 * once and caches immutably, and can read a Drive file with the server's own
 * credentials so a customer's photo never has to be made public.
 *
 * Because that route already resizes and sets immutable cache headers, running
 * these through next/image would be a second, redundant optimisation pass.
 */

const DRIVE_ID = /^[a-zA-Z0-9_-]{20,}$/;

/** Bumping this busts the immutable CDN cache for every derived photo. */
const NORMALISER_VERSION = 3;

export type PhotoSize = { width: number; height?: number; fit?: "cover" | "contain" | "inside" };

export function photoSrc(src: string, size: PhotoSize): string {
  const params = new URLSearchParams();
  if (DRIVE_ID.test(src)) params.set("drive", src);
  else params.set("src", src);

  params.set("w", String(size.width));
  if (size.height) params.set("h", String(size.height));
  params.set("fit", size.fit ?? "cover");
  params.set("v", String(NORMALISER_VERSION));

  return `/api/image?${params.toString()}`;
}

/** Widths served to a `srcset`, so a phone does not download a 2400px hero. */
const BREAKPOINTS = [640, 1024, 1600, 2400];

export function photoSrcSet(src: string, aspect?: number): string {
  return BREAKPOINTS.map((width) => {
    const height = aspect ? Math.round(width / aspect) : undefined;
    return `${photoSrc(src, { width, height })} ${width}w`;
  }).join(", ");
}
