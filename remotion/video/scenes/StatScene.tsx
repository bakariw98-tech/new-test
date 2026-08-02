import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { KenBurns } from "./KenBurns";
import { orientation } from "../layout";
import type { SlideProps } from "../../types";

/**
 * Beds / baths / square footage, counting up.
 *
 * The count-up runs on the numeric part only and the original string is
 * restored at the end, so "9,500" keeps its separator and a value like "3.5"
 * baths is not mangled into "4". A stat that is not numeric at all is shown
 * as-is rather than animated.
 */
function countUp(value: string, progress: number): string {
  const numeric = Number(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(numeric) || numeric === 0) return value;
  if (progress >= 1) return value;

  const current = numeric * progress;
  // Keep the same decimal precision as the target, so 3.5 does not flicker
  // through 3.4871.
  const decimals = value.includes(".") ? 1 : 0;
  return current.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export const StatScene: React.FC<SlideProps & { durationInFrames: number }> = ({
  listing,
  theme,
  photos,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const o = orientation(width, height);
  const ease = Easing.bezier(0.16, 1, 0.3, 1);

  const progress = interpolate(frame, [0.2 * fps, 1.6 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, fontFamily: theme.bodyFont }}>
      <KenBurns src={photos[0]} durationInFrames={durationInFrames} direction="out" drift="left" />

      {/* A flat 0.55 scrim was not enough: accent-coloured numerals over a
          bright sunlit exterior were unreadable. The gradient darkens hardest
          where the text sits and stays lighter elsewhere, so the photo is still
          legible as a photo. */}
      <AbsoluteFill
        style={{
          background: o.vertical
            ? "linear-gradient(90deg, rgba(0,0,0,0.86) 0%, rgba(0,0,0,0.7) 55%, rgba(0,0,0,0.5) 100%)"
            : "linear-gradient(180deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.78) 100%)",
        }}
      />

      <AbsoluteFill
        style={{
          padding: o.pad,
          paddingBottom: o.safeBottom,
          display: "flex",
          flexDirection: o.vertical ? "column" : "row",
          justifyContent: "center",
          alignItems: o.vertical ? "flex-start" : "center",
          gap: o.vertical ? o.size.h2 * 0.7 : o.size.h1,
        }}
      >
        {listing.stats.map((stat, i) => (
          <div
            key={stat.label}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: o.size.micro * 0.3,
              opacity: interpolate(
                frame,
                [(0.2 + i * 0.18) * fps, (0.9 + i * 0.18) * fps],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease },
              ),
              translate: interpolate(
                frame,
                [(0.2 + i * 0.18) * fps, (0.9 + i * 0.18) * fps],
                ["0px 24px", "0px 0px"],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease },
              ),
            }}
          >
            <div
              style={{
                color: theme.accent,
                fontSize: o.size.display,
                lineHeight: 0.95,
                fontFamily: theme.headingFont,
                fontWeight: theme.headingWeight,
                // Tabular figures stop the number jittering as digits change.
                fontVariantNumeric: "tabular-nums",
                // Holds the accent legible over whatever the photo does behind it.
                textShadow: "0 4px 24px rgba(0,0,0,0.75)",
              }}
            >
              {countUp(stat.value, progress)}
            </div>
            <div
              style={{
                color: "rgba(255,255,255,0.75)",
                fontSize: o.size.caption,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
