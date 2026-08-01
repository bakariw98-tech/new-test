/**
 * How long a listing video runs, derived from how many photos it has.
 *
 * A fixed duration is wrong in both directions: a four-photo listing pads with
 * dead air, and a twenty-photo listing either sprints or runs past the point
 * anyone keeps watching. This computes the timeline once and both the
 * composition and the renderer read it.
 */

export const FPS = 30;

const SECONDS = {
  title: 3,
  stats: 2.5,
  photo: 2.5,
  end: 3.5,
} as const;

/** Beyond this the video outstays its welcome; the rest of the photos are the carousel's job. */
const MAX_PHOTO_SCENES = 6;

export type VideoScene =
  | { kind: "title"; durationInFrames: number; photo: string }
  | { kind: "stats"; durationInFrames: number; photo: string }
  | { kind: "photo"; durationInFrames: number; photo: string; caption?: string; index: number }
  | { kind: "end"; durationInFrames: number; photo: string };

export function planScenes(params: {
  photos: Array<{ url: string; alt?: string }>;
}): VideoScene[] {
  const photos = params.photos;
  if (photos.length === 0) return [];

  const hero = photos[0];
  const rest = photos.slice(1);
  const tour = rest.slice(0, MAX_PHOTO_SCENES);

  const scenes: VideoScene[] = [
    { kind: "title", durationInFrames: Math.round(SECONDS.title * FPS), photo: hero.url },
    {
      kind: "stats",
      durationInFrames: Math.round(SECONDS.stats * FPS),
      // Reuse a tour photo behind the stats rather than the hero, so the
      // opening shot is not immediately repeated.
      photo: (tour[0] ?? hero).url,
    },
  ];

  tour.forEach((photo, i) => {
    scenes.push({
      kind: "photo",
      durationInFrames: Math.round(SECONDS.photo * FPS),
      photo: photo.url,
      caption: photo.alt,
      index: i,
    });
  });

  scenes.push({
    kind: "end",
    durationInFrames: Math.round(SECONDS.end * FPS),
    photo: (tour[tour.length - 1] ?? hero).url,
  });

  return scenes;
}

export function totalFrames(scenes: VideoScene[]): number {
  // A composition of zero frames throws, so an empty listing still gets one.
  return Math.max(1, scenes.reduce((sum, s) => sum + s.durationInFrames, 0));
}
