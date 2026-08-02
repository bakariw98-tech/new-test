import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * A photo with a slow drift, so a still image reads as footage.
 *
 * The movement is deliberately small — 1.0 to 1.08 over the whole scene. Bigger
 * moves look like a screensaver, and on an interior shot they swing the subject
 * out of frame.
 *
 * `scale` and `translate` are used as CSS properties rather than a `transform`
 * string, per Remotion's guidance: the interpolation stays inline and editable
 * in Studio.
 */
export const KenBurns: React.FC<{
  src: string;
  durationInFrames: number;
  /** Alternating direction keeps consecutive shots from feeling identical. */
  direction?: "in" | "out";
  drift?: "left" | "right" | "none";
}> = ({ src, durationInFrames, direction = "in", drift = "none" }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const shift = Math.round(Math.min(width, height) * 0.03);

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          scale: interpolate(
            frame,
            [0, durationInFrames],
            direction === "in" ? [1.02, 1.1] : [1.1, 1.02],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale" },
          ),
          translate: interpolate(
            frame,
            [0, durationInFrames],
            drift === "none"
              ? ["0px 0px", "0px 0px"]
              : drift === "left"
                ? [`${shift}px 0px`, `${-shift}px 0px`]
                : [`${-shift}px 0px`, `${shift}px 0px`],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          ),
        }}
      />
    </AbsoluteFill>
  );
};
