import React from "react";
import { AbsoluteFill, Img } from "remotion";
import type { SlideProps } from "../types";
import { SAFE_BOTTOM } from "../types";

/**
 * The last slide — the ask.
 *
 * A carousel that ends without a next step wastes the attention it just earned,
 * so the CTA is not optional here.
 */
export const ClosingSlide: React.FC<SlideProps> = ({ listing, brand, theme, photos }) => (
  <AbsoluteFill style={{ backgroundColor: theme.bg, fontFamily: theme.bodyFont }}>
    {photos[0] ? (
      <AbsoluteFill>
        <Img
          src={photos[0]}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "brightness(0.55) saturate(0.9)",
          }}
        />
        <AbsoluteFill
          style={{
            background: `linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0) 30%, ${theme.bg} 78%)`,
          }}
        />
      </AbsoluteFill>
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
        alignItems: "flex-start",
        gap: 28,
      }}
    >
      <div
        style={{
          color: theme.ink,
          fontSize: 76,
          lineHeight: 1.05,
          fontFamily: theme.headingFont,
          fontWeight: theme.headingWeight,
          letterSpacing: "-0.02em",
        }}
      >
        {brand.cta}
      </div>

      <div style={{ color: theme.inkMuted, fontSize: 32 }}>
        {listing.address} · {listing.cityStateZip}
      </div>

      <div
        style={{
          background: theme.accent,
          color: theme.onAccent,
          borderRadius: 999,
          padding: "24px 48px",
          fontSize: 32,
          fontWeight: 700,
          boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
        }}
      >
        {brand.handle}
      </div>

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
