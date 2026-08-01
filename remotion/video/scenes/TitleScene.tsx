import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { KenBurns } from "./KenBurns";
import { orientation } from "../layout";
import type { SlideProps } from "../../types";

/**
 * Opening shot. Hero photo pushing in, address and price resolving over it.
 *
 * Everything is driven by useCurrentFrame() and interpolate(). CSS transitions
 * and animations do not render in Remotion — each frame is captured
 * independently, so a CSS animation freezes at whatever state it happened to
 * reach.
 *
 * Note the first frame is deliberately not empty: the photo is fully visible
 * from frame 0 and only the text animates in. An entrance that starts at
 * opacity 0 everywhere produces a blank thumbnail, which is what the platform
 * shows before playback.
 */
export const TitleScene: React.FC<SlideProps & { durationInFrames: number }> = ({
  listing,
  brand,
  theme,
  photos,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const o = orientation(width, height);
  const ease = Easing.bezier(0.16, 1, 0.3, 1);

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, fontFamily: theme.bodyFont }}>
      <KenBurns src={photos[0]} durationInFrames={durationInFrames} direction="in" />

      <AbsoluteFill
        style={{
          background: o.vertical
            ? `linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.05) 35%, rgba(0,0,0,0.85) 100%)`
            : `linear-gradient(90deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0) 100%)`,
        }}
      />

      <AbsoluteFill
        style={{
          padding: o.pad,
          paddingBottom: o.safeBottom,
          display: "flex",
          flexDirection: "column",
          justifyContent: o.vertical ? "flex-end" : "center",
          alignItems: "flex-start",
          gap: o.size.body * 0.5,
          width: o.vertical ? "100%" : "58%",
        }}
      >
        <div
          style={{
            color: "#fff",
            fontSize: o.size.micro,
            fontWeight: 700,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            opacity: interpolate(frame, [0, 0.5 * fps], [0, 0.85], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: ease,
            }),
          }}
        >
          {listing.badge}
        </div>

        <div
          style={{
            color: "#fff",
            fontSize: o.size.h1,
            lineHeight: 1.02,
            fontFamily: theme.headingFont,
            fontWeight: theme.headingWeight,
            letterSpacing: "-0.02em",
            opacity: interpolate(frame, [0.3 * fps, 1.1 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: ease,
            }),
            translate: interpolate(frame, [0.3 * fps, 1.1 * fps], ["0px 28px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: ease,
            }),
          }}
        >
          {listing.address}
        </div>

        <div
          style={{
            color: "rgba(255,255,255,0.82)",
            fontSize: o.size.body,
            opacity: interpolate(frame, [0.6 * fps, 1.4 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: ease,
            }),
          }}
        >
          {listing.cityStateZip}
        </div>

        <div
          style={{
            marginTop: o.size.body * 0.4,
            background: theme.accent,
            color: theme.onAccent,
            borderRadius: 999,
            padding: `${o.size.caption * 0.55}px ${o.size.caption * 1.3}px`,
            fontSize: o.size.caption,
            fontWeight: 700,
            opacity: interpolate(frame, [0.9 * fps, 1.6 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: ease,
            }),
            scale: interpolate(frame, [0.9 * fps, 1.6 * fps], [0.88, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: ease,
              output: "perceptual-scale",
            }),
          }}
        >
          {listing.price}
        </div>
      </AbsoluteFill>

      <div
        style={{
          position: "absolute",
          top: o.pad,
          left: o.pad,
          color: "rgba(255,255,255,0.9)",
          fontSize: o.size.micro,
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        {brand.brokerage}
      </div>
    </AbsoluteFill>
  );
};
