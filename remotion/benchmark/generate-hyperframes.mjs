/**
 * Emits the HyperFrames version of the benchmark composition from the SAME
 * `beats.ts` the Remotion version renders.
 *
 * That shared source is the whole point: a renderer comparison is only honest
 * if both renderers are drawing identical content. Hand-writing 68 beats twice
 * would guarantee they drifted, and any timing difference would then be partly
 * a content difference.
 *
 * Run:  node --experimental-strip-types remotion/benchmark/generate-hyperframes.mjs <out.html>
 */

import { writeFileSync } from "node:fs";
import { BEATS } from "./beats.ts";

const FPS = 30;
const W = 1920;
const H = 1080;
const DURATION = BEATS.length; // one second per beat

const FG = { black: "#000000", white: "#FFFFFF", green: "#00FF00" };
const BG = { white: "#F5F5F7", black: "#000000", green: "#00FF00" };

/** Mirrors remotion/benchmark/primitives.tsx — same geometry, same viewBoxes. */
function shapeSvg(shape, color) {
  const c = FG[color];
  const S = 72;
  switch (shape) {
    case "chevron":
      return `<svg width="${S}" height="${S}" viewBox="0 0 100 100"><path class="draw" d="M30 20 L70 50 L30 80" stroke="${c}" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case "arrow":
      return `<svg width="${S}" height="${S}" viewBox="0 0 140 100"><path class="draw" d="M10 50 H110 M80 20 L110 50 L80 80" stroke="${c}" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case "double-arrow":
      return `<svg width="${S * 1.6}" height="${S}" viewBox="0 0 140 100"><path class="draw" d="M10 50 H110 M80 20 L110 50 L80 80" stroke="${c}" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path class="draw" d="M10 30 H90" stroke="${c}" stroke-width="6" fill="none" opacity="0.5" stroke-linecap="round"/></svg>`;
    case "underline":
    case "line":
      return `<svg width="140" height="16" viewBox="0 0 140 16"><rect class="growX" x="0" y="4" width="140" height="8" fill="${c}" rx="4"/></svg>`;
    case "square-outline":
      return `<svg width="${S}" height="${S}" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" rx="14" stroke="${c}" stroke-width="8" fill="none"/></svg>`;
    case "square-checked":
      return `<svg width="${S}" height="${S}" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" rx="14" stroke="${c}" stroke-width="8" fill="none"/><path class="draw" d="M28 52 L44 68 L74 34" stroke="${c}" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case "device-outline":
      return `<svg width="${S * 0.7}" height="${S}" viewBox="0 0 70 100"><rect class="draw" x="5" y="5" width="60" height="90" rx="10" stroke="${c}" stroke-width="7" fill="none"/></svg>`;
    case "burst":
    case "dashed-burst": {
      const dash = shape === "dashed-burst" ? ' stroke-dasharray="4 6"' : "";
      const lines = Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        const x1 = 50 + Math.cos(a) * 22;
        const y1 = 50 + Math.sin(a) * 22;
        const x2 = 50 + Math.cos(a) * 48;
        const y2 = 50 + Math.sin(a) * 48;
        return `<line class="ray" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${c}" stroke-width="6" stroke-linecap="round"${dash}/>`;
      }).join("");
      return `<svg width="${S}" height="${S}" viewBox="0 0 100 100">${lines}</svg>`;
    }
    case "dot-grid": {
      const dots = Array.from({ length: 9 }, (_, i) => {
        const x = 20 + (i % 3) * 30;
        const y = 20 + Math.floor(i / 3) * 30;
        return `<circle class="dot" cx="${x}" cy="${y}" r="8" fill="${c}"/>`;
      }).join("");
      return `<svg width="${S}" height="${S}" viewBox="0 0 100 100">${dots}</svg>`;
    }
    case "circle-rings":
      return `<svg width="${S}" height="${S}" viewBox="0 0 100 100"><circle cx="50" cy="50" r="20" stroke="${c}" stroke-width="6" fill="none"/><circle class="draw" cx="50" cy="50" r="38" stroke="${c}" stroke-width="5" fill="none"/></svg>`;
    case "building":
      return `<svg width="${S}" height="${S}" viewBox="0 0 100 100"><rect class="growY" x="15" y="40" width="70" height="50" fill="${c}"/><rect x="30" y="15" width="12" height="30" fill="${c}"/></svg>`;
    case "pointer":
      return `<svg width="${S * 0.6}" height="${S}" viewBox="0 0 60 100"><path d="M15 10 L15 75 L32 60 L45 90 L55 85 L42 55 L62 55 Z" fill="${c}"/></svg>`;
    default:
      return "";
  }
}

/** Generic abstract mark standing in for a logo — not a reproduced trademark. */
function wordmarkSvg(color, leaf) {
  const size = 84;
  const leafPath = leaf
    ? `<path d="M50 4 C60 4 66 12 62 20 C54 20 48 14 50 4 Z" fill="${FG.green}"/>`
    : "";
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100"><path d="M50 12 C74 12 90 32 90 56 C90 80 72 92 50 92 C28 92 10 80 10 56 C10 32 26 12 50 12 Z M50 12 C44 4 38 -2 50 4" fill="${FG[color]}"/>${leafPath}</svg>`;
}

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const clips = [];
const tweens = [];

for (const beat of BEATS) {
  const id = `beat-${beat.second}`;
  const start = beat.second;

  const bgLayer =
    beat.bg === "video"
      ? `<div class="fill videobg"><div class="vidlabel">[placeholder b-roll: ${esc(beat.videoLabel ?? "")}]</div></div>`
      : `<div class="fill" style="background:${BG[beat.bg]}"></div>`;

  const parts = beat.elements.map((el, i) => {
    const eid = `${id}-el-${i}`;
    if (el.kind === "wordmark") {
      return `<div class="item" id="${eid}">${wordmarkSvg(el.color, el.leaf)}</div>`;
    }
    if (el.kind === "shape") {
      return `<div class="item" id="${eid}">${shapeSvg(el.shape, el.color)}</div>`;
    }
    if (el.kind === "pattern") {
      return `<div class="item pattern" id="${eid}">${shapeSvg(el.shape, el.color)}</div>`;
    }
    return `<div class="item txt" id="${eid}" style="color:${FG[el.color]};font-weight:${
      el.bold ? 700 : 400
    }">${esc(el.content)}</div>`;
  });

  clips.push(
    `      <section class="clip" id="${id}" data-start="${start}" data-duration="1" data-track-index="1">
        ${bgLayer}
        <div class="stage">
${parts.map((p) => `          ${p}`).join("\n")}
        </div>
      </section>`,
  );

  // Per-element entrance, staggered inside the beat's own second — the same
  // 2f-offset / 10f-window shape the Remotion version uses, expressed in
  // seconds because GSAP works in time, not frames.
  beat.elements.forEach((_, i) => {
    const at = start + Math.min(2 + i * 2, 10) / FPS;
    const dur = 10 / FPS;
    tweens.push(
      `tl.fromTo("#${id}-el-${i}", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: ${dur.toFixed(4)}, ease: "power3.out" }, ${at.toFixed(4)});`,
    );
    tweens.push(
      `drawIn("#${id}-el-${i}", ${at.toFixed(4)}, ${dur.toFixed(4)});`,
    );
  });
}

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <title>Carbon Neutral 2030 — render benchmark</title>
    <script src="./vendor/gsap.min.js"></script>
    <style>
      /* Self-hosted: Chrome cannot reach fonts.googleapis.com or a CDN from
         this container, and a render-time fetch is a failure mode either way. */
      @font-face {
        font-family: "Inter";
        src: url("./vendor/fonts/inter-variable.woff2") format("woff2");
        font-weight: 100 900;
        font-style: normal;
        font-display: block;
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
      body { font-family: "Inter", sans-serif; }
      #root { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
      .clip { position: absolute; inset: 0; }
      /* A full-screen fill must sit on a child, never the root — the producer's
         frame compositing can drop the root's own background and render black. */
      .fill { position: absolute; inset: 0; }
      .videobg { background: linear-gradient(135deg, #2a2a2a 0%, #050505 100%); }
      .vidlabel {
        position: absolute; top: 24px; left: 24px; font-size: 20px;
        color: rgba(255,255,255,0.35); letter-spacing: 0.08em; text-transform: uppercase;
      }
      .stage {
        position: absolute; inset: 0; display: flex; flex-direction: row; flex-wrap: wrap;
        align-items: center; justify-content: center; gap: 28px; row-gap: 20px; padding: 0 140px;
      }
      .item { display: flex; align-items: center; justify-content: center; }
      .txt { font-size: 108px; line-height: 1.02; letter-spacing: -0.01em; white-space: nowrap; }
      .pattern { transform: scale(2.4); }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="main"
      data-start="0"
      data-duration="${DURATION}"
      data-width="${W}"
      data-height="${H}"
      data-fps="${FPS}"
    >
${clips.join("\n")}
    </div>

    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });

      /**
       * Stroke-draw and grow entrances, matched to the element's own entrance
       * window. Measured with getTotalLength() rather than hard-coded, and set
       * inside the tween (never as a CSS initial transform that a GSAP tween on
       * the same property would then fight).
       */
      function drawIn(sel, at, dur) {
        const host = document.querySelector(sel);
        if (!host) return;
        host.querySelectorAll(".draw").forEach((p) => {
          const len = p.getTotalLength ? p.getTotalLength() : 0;
          if (!len) return;
          p.style.strokeDasharray = len;
          tl.fromTo(p, { strokeDashoffset: len }, { strokeDashoffset: 0, duration: dur, ease: "power3.out" }, at);
        });
        host.querySelectorAll(".growX").forEach((el) => {
          el.style.transformOrigin = "left center";
          tl.fromTo(el, { scaleX: 0 }, { scaleX: 1, duration: dur, ease: "power3.out" }, at);
        });
        host.querySelectorAll(".growY").forEach((el) => {
          el.style.transformOrigin = "50% 100%";
          tl.fromTo(el, { scaleY: 0.6 }, { scaleY: 1, duration: dur, ease: "power3.out" }, at);
        });
        host.querySelectorAll(".ray").forEach((el, i) => {
          tl.fromTo(el, { scale: 0.45, opacity: 0 }, { scale: 1, opacity: 1, duration: dur, ease: "power3.out" }, at + i * 0.004);
        });
        host.querySelectorAll(".dot").forEach((el, i) => {
          tl.fromTo(el, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: dur * 0.6, ease: "back.out(1.6)" }, at + i * (dur / 9));
        });
      }

${tweens.map((t) => `      ${t}`).join("\n")}

      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;

const out = process.argv[2];
if (!out) {
  console.error("usage: generate-hyperframes.mjs <out.html>");
  process.exit(1);
}
writeFileSync(out, html, "utf8");
console.log(
  `wrote ${out}: ${BEATS.length} beats, ${DURATION}s @ ${FPS}fps = ${DURATION * FPS} frames, ${tweens.length} tween calls`,
);
