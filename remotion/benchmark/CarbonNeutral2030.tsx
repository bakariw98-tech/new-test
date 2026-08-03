/**
 * Render-speed benchmark composition. Not a product deliverable.
 *
 * 68 one-second beats, hard cuts, a full text/graphic redraw at every beat
 * boundary — chosen to stress the renderer the way a long, fast-cut piece
 * actually would, rather than the smooth 4-5-scene listing video every other
 * composition in this repo renders. Exists to get one honest Sandbox timing
 * number; not wired into any MCP tool a real user would call, and not meant
 * to stay in the repo once that number is in hand.
 */

import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { BEATS, type Beat } from "./beats";
import { BG, FG, ShapeGlyph, Wordmark, enter } from "./primitives";

const FPS = 30;
export const TOTAL_FRAMES = BEATS.length * FPS;

const VideoPlaceholder: React.FC<{ label?: string }> = ({ label }) => (
  <AbsoluteFill
    style={{
      background: "linear-gradient(135deg, #2a2a2a 0%, #050505 100%)",
    }}
  >
    {/* No real b-roll is being sourced for a speed test — this stands in for
        the decode/paint cost a video layer would add, clearly labelled so it
        is never mistaken for a finished frame. */}
    <div
      style={{
        position: "absolute",
        top: 24,
        left: 24,
        fontSize: 20,
        color: "rgba(255,255,255,0.35)",
        fontFamily: "Inter, sans-serif",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      [placeholder b-roll: {label}]
    </div>
  </AbsoluteFill>
);

const BeatScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  const frame = useCurrentFrame();
  const progress = enter(frame, 2, 14);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: beat.bg === "video" ? undefined : BG[beat.bg],
        fontFamily: "Inter, sans-serif",
      }}
    >
      {beat.bg === "video" ? <VideoPlaceholder label={beat.videoLabel} /> : null}

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          padding: "0 140px",
          rowGap: 20,
        }}
      >
        {beat.elements.map((el, i) => {
          // A small per-element stagger inside the shared 14-frame entrance
          // window, capped so the last element of a busy beat still lands
          // comfortably before the beat's frame runs out.
          const staggerFrom = Math.min(2 + i * 2, 10);
          const elProgress = enter(frame, staggerFrom, 10);
          const style: React.CSSProperties = {
            opacity: elProgress,
            translate: `0 ${(1 - elProgress) * 18}px`,
          };

          if (el.kind === "wordmark") {
            return (
              <div key={i} style={style}>
                <Wordmark color={el.color} leaf={el.leaf} />
              </div>
            );
          }
          if (el.kind === "shape") {
            return (
              <div key={i} style={style}>
                <ShapeGlyph shape={el.shape} color={el.color} progress={elProgress} />
              </div>
            );
          }
          if (el.kind === "pattern") {
            // A single large instance stands in for a repeated field — actual
            // per-tile repetition is a design decision, not a render-cost one.
            return (
              <div key={i} style={{ ...style, transform: "scale(2.4)" }}>
                <ShapeGlyph shape={el.shape} color={el.color} progress={elProgress} />
              </div>
            );
          }
          // text
          return (
            <span
              key={i}
              style={{
                ...style,
                color: FG[el.color],
                fontWeight: el.bold ? 700 : 400,
                fontSize: 108,
                lineHeight: 1.02,
                letterSpacing: "-0.01em",
                whiteSpace: "nowrap",
              }}
            >
              {el.content}
            </span>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const CarbonNeutral2030: React.FC = () => {
  const { fps } = useVideoConfig();
  void fps; // Beats are authored in whole seconds against the fixed FPS above, not the runtime fps.

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {BEATS.map((beat) => (
        <Sequence
          key={beat.second}
          from={beat.second * FPS}
          durationInFrames={FPS}
          layout="absolute-fill"
        >
          <BeatScene beat={beat} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
