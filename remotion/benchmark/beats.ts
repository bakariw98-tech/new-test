/**
 * The 68-beat timeline for the render-speed benchmark composition.
 *
 * Transcribed from the pasted spec's compact `{s, bg, el}` block — that block
 * is the source of truth because it is the only one that runs the full 0–67;
 * the verbose block cut off mid-string at beat 22. Where the two overlap
 * (beats 0–21), the verbose block's extra detail (`animation`, `position`) is
 * folded in here.
 *
 * This exists to give the Sandbox renderer 68 seconds of constant, real
 * text/graphic churn — a hard cut and a full redraw every single second — for
 * an honest throughput number. It is not a design deliverable: private,
 * never shared, and not part of the product's listing compositions.
 */

export type Color = "black" | "white" | "green";

export type Shape =
  | "chevron"
  | "square-outline"
  | "square-checked"
  | "underline"
  | "device-outline"
  | "burst"
  | "dashed-burst"
  | "arrow"
  | "double-arrow"
  | "line"
  | "dot-grid"
  | "circle-rings"
  | "building"
  | "pointer";

export type BeatElement =
  | { kind: "text"; content: string; color: Color; bold?: boolean; accentWord?: string }
  | { kind: "wordmark"; color: Color; leaf?: boolean }
  | { kind: "shape"; shape: Shape; color: Color }
  | { kind: "pattern"; shape: Shape; color: Color };

export type Background = "white" | "black" | "green" | "video";

export type Beat = {
  second: number;
  bg: Background;
  /** Only set when bg is "video" — labels which placeholder panel to show. */
  videoLabel?: string;
  elements: BeatElement[];
};

const text = (content: string, color: Color, bold = true): BeatElement => ({
  kind: "text",
  content,
  color,
  bold,
});
const wordmark = (color: Color, leaf = false): BeatElement => ({ kind: "wordmark", color, leaf });
const shape = (shape: Shape, color: Color): BeatElement => ({ kind: "shape", shape, color });
const pattern = (shape: Shape, color: Color): BeatElement => ({ kind: "pattern", shape, color });

export const BEATS: Beat[] = [
  { second: 0, bg: "white", elements: [wordmark("black", true), text("has", "black")] },
  { second: 1, bg: "white", elements: [wordmark("black"), text("has a plan", "black"), shape("chevron", "green")] },
  {
    second: 2,
    bg: "white",
    elements: [
      wordmark("black"),
      text("has a plan", "black"),
      shape("chevron", "green"),
      text("AND A PROMISE.", "green"),
    ],
  },
  { second: 3, bg: "white", elements: [text("To make", "black"), wordmark("black"), text("carbon neutral", "black")] },
  { second: 4, bg: "green", elements: [text("To make", "black"), wordmark("black"), text("carbon neutral", "black")] },
  { second: 5, bg: "black", elements: [shape("square-outline", "white"), text("we", "white")] },
  {
    second: 6,
    bg: "black",
    elements: [
      shape("square-checked", "green"),
      text("we've", "white"),
      text("ALREADY", "green"),
      text("done that", "white"),
      shape("underline", "green"),
    ],
  },
  { second: 7, bg: "green", elements: [text("singl", "black")] },
  { second: 8, bg: "green", elements: [text("carbon neutral", "black")] },
  {
    second: 9,
    bg: "green",
    elements: [text("carbon neutral by 2030.", "black"), shape("underline", "white")],
  },
  {
    second: 10,
    bg: "black",
    elements: [text("(", "green"), text("even yours", "white"), text(")", "green")],
  },
  { second: 11, bg: "black", elements: [text("We're working", "white")] },
  {
    second: 12,
    bg: "black",
    elements: [text("every", "white"), shape("device-outline", "green"), text("iPHONE", "green")],
  },
  {
    second: 13,
    bg: "black",
    elements: [text("every", "white"), shape("device-outline", "green"), text("MAC", "green")],
  },
  { second: 14, bg: "black", elements: [text("with 100%", "white")] },
  {
    second: 15,
    bg: "black",
    elements: [text("100% recycled", "white"), shape("chevron", "green"), text("OR RENEWABLE", "green")],
  },
  {
    second: 16,
    bg: "black",
    elements: [
      text("100% recycled materials", "white"),
      shape("chevron", "green"),
      text("OR RENEWABLE", "green"),
    ],
  },
  { second: 17, bg: "black", elements: [text("new ways", "white"), shape("burst", "green")] },
  { second: 18, bg: "video", videoLabel: "aluminum", elements: [text("aluminum", "white")] },
  { second: 19, bg: "video", videoLabel: "tungsten", elements: [text("tungsten", "white")] },
  {
    second: 20,
    bg: "black",
    elements: [text("from recycled", "white"), wordmark("white"), text("products.", "white")],
  },
  {
    second: 21,
    bg: "black",
    elements: [text("from recycled", "white"), wordmark("white"), text("products.", "white")],
  },
  { second: 22, bg: "white", elements: [text("We're growing", "black"), shape("dot-grid", "green")] },
  { second: 23, bg: "green", elements: [pattern("dot-grid", "black")] },
  { second: 24, bg: "white", elements: [text("cling enough paper", "black")] },
  {
    second: 25,
    bg: "white",
    elements: [text("all our packaging.", "black"), shape("device-outline", "green")],
  },
  {
    second: 26,
    bg: "white",
    elements: [
      text("all our packaging.", "black"),
      shape("device-outline", "green"),
      shape("underline", "green"),
    ],
  },
  { second: 27, bg: "black", elements: [text("But we can do", "white")] },
  { second: 28, bg: "black", elements: [text("MORE.", "green")] },
  { second: 29, bg: "green", elements: [shape("building", "black")] },
  { second: 30, bg: "green", elements: [text("goes into our products.", "black")] },
  { second: 31, bg: "green", elements: [text("it's also they're made", "black")] },
  {
    second: 32,
    bg: "green",
    elements: [text("it's also HOW they're made.", "black"), shape("underline", "black")],
  },
  { second: 33, bg: "white", elements: [text("Hundreds of", "black"), shape("line", "green")] },
  { second: 34, bg: "white", elements: [text("distributors", "black"), shape("double-arrow", "green")] },
  { second: 35, bg: "white", elements: [text("assemblers", "black"), shape("double-arrow", "green")] },
  { second: 36, bg: "white", elements: [text("material-", "black"), shape("arrow", "green")] },
  { second: 37, bg: "white", elements: [text("material-makers", "black"), shape("arrow", "green")] },
  {
    second: 38,
    bg: "video",
    videoLabel: "robot",
    elements: [text("All upgrading", "white"), shape("pointer", "green")],
  },
  { second: 39, bg: "green", elements: [text("100%", "black"), shape("burst", "white")] },
  {
    second: 40,
    bg: "green",
    elements: [text("renewable energy.", "black"), shape("circle-rings", "white")],
  },
  { second: 41, bg: "green", elements: [text("are even going", "black")] },
  { second: 42, bg: "black", elements: [shape("dashed-burst", "white")] },
  {
    second: 43,
    bg: "black",
    elements: [text("But it's", "white"), text("STILL", "green"), shape("arrow", "green")],
  },
  {
    second: 44,
    bg: "black",
    elements: [text("But it's not enough", "white"), text("STILL", "green"), shape("arrow", "green")],
  },
  { second: 45, bg: "black", elements: [text("Manufacturing", "white")] },
  { second: 46, bg: "video", videoLabel: "iphone", elements: [text("is just a part of it.", "white")] },
  { second: 47, bg: "white", elements: [text("all", "black"), shape("underline", "green")] },
  { second: 48, bg: "black", elements: [text("of YOU?", "white"), shape("underline", "green")] },
  { second: 49, bg: "white", elements: [wordmark("black", true), text("devices", "black")] },
  { second: 50, bg: "white", elements: [text("all over", "black"), shape("circle-rings", "green")] },
  { second: 51, bg: "white", elements: [text("And by", "black"), text("2030", "green")] },
  { second: 52, bg: "green", elements: [text("electr", "black")] },
  {
    second: 53,
    bg: "green",
    elements: [
      text("all of your devices", "black"),
      text("MAGIC MOUSE", "black"),
      text("APPLE PENCIL", "black"),
    ],
  },
  { second: 54, bg: "black", elements: [text("will be", "white")] },
  { second: 55, bg: "black", elements: [text("100% renewable.", "green")] },
  { second: 56, bg: "black", elements: [text("100% renewable.", "green")] },
  {
    second: 57,
    bg: "white",
    elements: [text("So YOU'RE a part of THIS,", "black"), shape("arrow", "green")],
  },
  { second: 58, bg: "white", elements: [text("Because", "black")] },
  { second: 59, bg: "white", elements: [wordmark("black"), text("is going carbon neutral.", "black")] },
  { second: 60, bg: "white", elements: [wordmark("black"), text("is going carbon neutral.", "black")] },
  {
    second: 61,
    bg: "white",
    elements: [
      text("EVERYTHING", "green"),
      shape("chevron", "green"),
      wordmark("black"),
      text("is going carbon neutral.", "black"),
    ],
  },
  {
    second: 62,
    bg: "white",
    elements: [
      text("EVERYTHING", "green"),
      shape("chevron", "green"),
      wordmark("black"),
      text("is going carbon neutral.", "black"),
    ],
  },
  { second: 63, bg: "white", elements: [wordmark("black"), text("has a plan.", "black")] },
  { second: 64, bg: "white", elements: [wordmark("black"), text("has a plan.", "black")] },
  { second: 65, bg: "white", elements: [text("apple.com/", "black")] },
  { second: 66, bg: "white", elements: [text("apple.com/", "black"), text("2030", "green")] },
  { second: 67, bg: "white", elements: [wordmark("black", true)] },
];

if (BEATS.length !== 68 || BEATS.some((b, i) => b.second !== i)) {
  throw new Error(
    `BEATS must have exactly 68 entries indexed 0-67; got ${BEATS.length} entries. ` +
      "A gap or duplicate here silently shifts every later beat's timing.",
  );
}
