/**
 * Turns a stored listing into the sequence of slides that make up a carousel.
 *
 * This is the join that was missing. The website read from the listing store
 * while the carousel took its data from tool arguments, which meant publishing
 * a property meant typing its price twice — once as `priceCents: 2450000000`
 * and once as `"$24,500,000"` — with nothing keeping them honest. Both now
 * derive from the same `RenderContext`.
 */

import type { RenderContext } from "../../core/types";
import { photoSrc } from "../website/photo";
import type { SlideProps, SlideTheme } from "../../../remotion/types";

export type SlideId = "ListingCard" | "TourSlide" | "ClosingSlide";

export type PlannedSlide = {
  /** Ordered, zero-padded, so files sort correctly wherever they land. */
  name: string;
  id: SlideId;
  props: SlideProps;
};

/** Instagram allows 20 images per carousel. */
const MAX_SLIDES = 20;

function slideTheme(context: RenderContext): SlideTheme {
  const t = context.theme;
  return {
    bg: t.color.bg,
    surface: t.color.surface,
    ink: t.color.ink,
    inkMuted: t.color.inkMuted,
    accent: t.color.accent,
    onAccent: t.color.onAccent,
    line: t.color.line,
    // Concrete stacks: the render machine has no system fonts, so a bare family
    // name with no fallback is a silent substitution waiting to happen.
    headingFont: `"${t.font.heading}", Georgia, serif`,
    bodyFont: `"${t.font.body}", system-ui, sans-serif`,
    headingWeight: t.font.headingWeight,
  };
}

/**
 * Photos are served through /api/image rather than linked directly: it converts
 * formats, pre-sizes so a 4000px original is not rescaled on every render, and
 * can read a Drive file with the server's own credentials.
 */
function slidePhoto(context: RenderContext, url: string): string {
  const origin = context.urls.site.replace(/\/p\/[^/]*$/, "");
  return `${origin}${photoSrc(url, { width: 1200, height: 1500 })}`;
}

export function planCarousel(context: RenderContext, options?: { captions?: string[] }): PlannedSlide[] {
  const { listing, brand, formatted, photos } = context;
  const theme = slideTheme(context);

  const base = {
    listing: {
      badge: "Just listed",
      price: formatted.price,
      address: formatted.address,
      cityStateZip: formatted.cityStateZip,
      stats: formatted.stats,
    },
    brand: {
      brokerage: formatted.brandMark,
      handle: brand.instagram ?? brand.website ?? "",
      cta: brand.ctaText,
    },
    theme,
  };

  const hero = photos.find((p) => p.role === "hero") ?? photos[0];
  const rest = photos.filter((p) => p !== hero);

  const slides: PlannedSlide[] = [
    {
      name: "01-listing-card",
      id: "ListingCard",
      props: { ...base, photos: hero ? [slidePhoto(context, hero.url)] : [] },
    },
  ];

  // Reserve the first and last positions, so the tour never squeezes out the
  // closing slide on a listing with a lot of photos.
  const room = MAX_SLIDES - 2;
  rest.slice(0, room).forEach((photo, i) => {
    slides.push({
      name: `${String(i + 2).padStart(2, "0")}-photo`,
      id: "TourSlide",
      props: {
        ...base,
        photos: [slidePhoto(context, photo.url)],
        // A caption must describe what is in *this* frame. Absent a real one,
        // the photo's own alt text is the only honest source; inventing copy
        // here is how a slide ends up promising a fountain that is not in shot.
        caption: options?.captions?.[i] ?? photo.alt ?? undefined,
        index: i + 2,
        total: Math.min(rest.length, room) + 2,
      },
    });
  });

  slides.push({
    name: `${String(slides.length + 1).padStart(2, "0")}-closing`,
    id: "ClosingSlide",
    props: {
      ...base,
      photos: hero ? [slidePhoto(context, (rest[rest.length - 1] ?? hero).url)] : [],
    },
  });

  return slides;
}

/**
 * The listing video's props, from the same context the carousel uses.
 *
 * Sharing `slideTheme` and `formatted` is the point: a video and a carousel for
 * the same property cannot disagree about its price, because neither of them
 * formats one.
 */
/**
 * The URL the video renderer will actually fetch for a photo.
 *
 * Exported because the preflight check has to probe the same URL the renderer
 * uses — checking the original source instead would pass on a Drive file that
 * `/api/image` cannot read, which is the exact failure worth catching.
 */
export function videoPhotoUrl(context: RenderContext, url: string): string {
  const origin = context.urls.site.replace(/\/p\/[^/]*$/, "");
  // Landscape-friendly dimensions: video frames are wider than a 4:5 slide, and
  // requesting a tall crop here would throw away the sides.
  return `${origin}${photoSrc(url, { width: 1920, height: 1080 })}`;
}

export function planVideo(context: RenderContext): {
  listing: SlideProps["listing"];
  brand: SlideProps["brand"];
  theme: SlideTheme;
  photos: string[];
  media: Array<{ url: string; alt?: string }>;
} {
  const { brand, formatted, photos } = context;

  const media = photos.map((photo) => ({
    url: videoPhotoUrl(context, photo.url),
    alt: photo.alt ?? undefined,
  }));

  return {
    listing: {
      badge: "Just listed",
      price: formatted.price,
      address: formatted.address,
      cityStateZip: formatted.cityStateZip,
      stats: formatted.stats,
    },
    brand: {
      brokerage: formatted.brandMark,
      handle: brand.instagram ?? brand.website ?? "",
      cta: brand.ctaText,
    },
    theme: slideTheme(context),
    // Scenes each override this with their own photo; a non-empty default keeps
    // the type honest.
    photos: media.slice(0, 1).map((m) => m.url),
    media,
  };
}
