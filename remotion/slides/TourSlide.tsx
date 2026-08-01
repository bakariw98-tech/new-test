import React from "react";
import { AbsoluteFill, Img } from "remotion";
import type { SlideProps } from "../types";
import { SAFE_BOTTOM } from "../types";

/**
 * Middle slides — one photo, one caption.
 *
 * The photo is letterboxed rather than cropped when it is much wider than the
 * frame. Cropping a 16:9 aerial to 4:5 removes the subject, which has already
 * produced one slide captioned for a fountain that was not in shot. A blurred,
 * darkened copy of the same photo fills the gap so the frame never reads as
 * empty.
 */
export const TourSlide: React.FC<SlideProps> = ({ theme, photos, caption, index, total, brand }) => {
  const photo = photos[0];

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, fontFamily: theme.bodyFont }}>
      <AbsoluteFill>
        <Img
          src={photo}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "blur(48px) brightness(0.45)",
            transform: "scale(1.15)",
          }}
        />
      </AbsoluteFill>

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start" }}>
        <Img
          src={photo}
          style={{
            width: "100%",
            height: 1000,
            objectFit: "contain",
            objectPosition: "center",
          }}
        />
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 55%, ${theme.bg} 88%)`,
        }}
      />

      {index && total ? (
        <div
          style={{
            position: "absolute",
            top: 56,
            left: 56,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(12px)",
            color: "#fff",
            borderRadius: 999,
            padding: "14px 28px",
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "0.06em",
          }}
        >
          {index} / {total}
        </div>
      ) : null}

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: SAFE_BOTTOM,
          padding: "0 64px",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {caption ? (
          <div
            style={{
              color: theme.ink,
              fontSize: 60,
              lineHeight: 1.12,
              fontFamily: theme.headingFont,
              fontWeight: theme.headingWeight,
              letterSpacing: "-0.015em",
            }}
          >
            {caption}
          </div>
        ) : null}
        <div
          style={{
            color: theme.inkMuted,
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          {brand.brokerage}
        </div>
      </div>
    </AbsoluteFill>
  );
};
