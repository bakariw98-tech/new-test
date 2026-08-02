/**
 * Orientation-aware layout values.
 *
 * 16:9 and 9:16 are not the same layout scaled — a hero that reads full-bleed
 * vertical is letterboxed nonsense in landscape, and type sized for a 1920px
 * width is unreadable at 1080px on a phone. One set of components serves both
 * by asking here rather than by branching inline everywhere.
 */

export type Orientation = {
  vertical: boolean;
  width: number;
  height: number;
  /** Outer padding. */
  pad: number;
  /**
   * Distance from the bottom that content must clear. Reels and TikTok overlay
   * the caption, username and action rail across the bottom of a vertical
   * frame; landscape video has no such chrome.
   */
  safeBottom: number;
  size: {
    display: number;
    h1: number;
    h2: number;
    body: number;
    caption: number;
    micro: number;
  };
};

export function orientation(width: number, height: number): Orientation {
  const vertical = height > width;
  // Type is sized off the short edge so it occupies the same share of the
  // frame in both orientations.
  const base = Math.min(width, height) / 1080;

  return {
    vertical,
    width,
    height,
    pad: Math.round((vertical ? 72 : 96) * base),
    safeBottom: vertical ? 320 : 80,
    size: {
      display: Math.round(140 * base),
      h1: Math.round(84 * base),
      h2: Math.round(56 * base),
      body: Math.round(38 * base),
      caption: Math.round(32 * base),
      micro: Math.round(26 * base),
    },
  };
}
