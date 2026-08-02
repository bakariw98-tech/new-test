import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { KenBurns } from "./KenBurns";
import { orientation } from "../layout";
import type { SlideProps } from "../../types";

/**
 * The ask.
 *
 * A video that ends without a next step wastes the attention it just earned,
 * so the CTA and the handle are not conditional. The brokerage line is always
 * present too — a clip circulating without attribution is a compliance problem,
 * not just a branding one.
 */
export const EndScene: React.FC<SlideProps & { durationInFrames: number }> = ({
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

  const reveal = (delay: number) =>
    interpolate(frame, [delay * fps, (delay + 0.7) * fps], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: ease,
    });

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, fontFamily: theme.bodyFont }}>
      {photos[0] ? (
        <KenBurns src={photos[0]} durationInFrames={durationInFrames} direction="in" />
      ) : null}

      <AbsoluteFill style={{ background: "rgba(0,0,0,0.68)" }} />

      <AbsoluteFill
        style={{
          padding: o.pad,
          paddingBottom: o.safeBottom,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: o.vertical ? "flex-start" : "center",
          textAlign: o.vertical ? "left" : "center",
          gap: o.size.body * 0.6,
        }}
      >
        <div
          style={{
            color: "#fff",
            fontSize: o.size.h1,
            lineHeight: 1.04,
            fontFamily: theme.headingFont,
            fontWeight: theme.headingWeight,
            letterSpacing: "-0.02em",
            opacity: reveal(0.15),
            translate: interpolate(frame, [0.15 * fps, 0.85 * fps], ["0px 24px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: ease,
            }),
          }}
        >
          {brand.cta}
        </div>

        <div
          style={{
            color: "rgba(255,255,255,0.8)",
            fontSize: o.size.body,
            opacity: reveal(0.5),
          }}
        >
          {listing.address} · {listing.cityStateZip}
        </div>

        {brand.handle ? (
          <div
            style={{
              marginTop: o.size.body * 0.3,
              background: theme.accent,
              color: theme.onAccent,
              borderRadius: 999,
              padding: `${o.size.caption * 0.6}px ${o.size.caption * 1.5}px`,
              fontSize: o.size.caption,
              fontWeight: 700,
              opacity: reveal(0.85),
              scale: interpolate(frame, [0.85 * fps, 1.55 * fps], [0.9, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ease,
                output: "perceptual-scale",
              }),
            }}
          >
            {brand.handle}
          </div>
        ) : null}

        <div
          style={{
            marginTop: o.size.body * 0.4,
            color: "rgba(255,255,255,0.6)",
            fontSize: o.size.micro,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            opacity: reveal(1.2),
          }}
        >
          {brand.brokerage}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
