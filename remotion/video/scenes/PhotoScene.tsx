import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { KenBurns } from "./KenBurns";
import { orientation } from "../layout";
import type { SlideProps } from "../../types";

/**
 * One photo, one caption.
 *
 * The caption is only ever the photo's own alt text — never generated. The
 * honest answer to "what is in this picture" is the description of that
 * picture, and writing copy at render time is how a slide ended up promising a
 * fountain that was not in the frame.
 */
export const PhotoScene: React.FC<
  SlideProps & { durationInFrames: number; sceneIndex: number }
> = ({ theme, photos, caption, durationInFrames, sceneIndex }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const o = orientation(width, height);
  const ease = Easing.bezier(0.16, 1, 0.3, 1);

  // Alternate the move so consecutive shots do not feel mechanical.
  const direction = sceneIndex % 2 === 0 ? "in" : "out";
  const drift = sceneIndex % 3 === 0 ? "none" : sceneIndex % 3 === 1 ? "left" : "right";

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, fontFamily: theme.bodyFont }}>
      <KenBurns
        src={photos[0]}
        durationInFrames={durationInFrames}
        direction={direction}
        drift={drift}
      />

      {caption ? (
        <>
          <AbsoluteFill
            style={{
              background: `linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.78) 100%)`,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: o.pad,
              right: o.pad,
              bottom: o.safeBottom,
              color: "#fff",
              fontSize: o.size.h2,
              lineHeight: 1.12,
              fontFamily: theme.headingFont,
              fontWeight: theme.headingWeight,
              letterSpacing: "-0.015em",
              opacity: interpolate(frame, [0.15 * fps, 0.8 * fps], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ease,
              }),
              translate: interpolate(frame, [0.15 * fps, 0.8 * fps], ["0px 20px", "0px 0px"], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ease,
              }),
            }}
          >
            {caption}
          </div>
        </>
      ) : null}
    </AbsoluteFill>
  );
};
