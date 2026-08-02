import React from "react";
import { AbsoluteFill, Img } from "remotion";
import type { SlideProps } from "../types";
import { SAFE_BOTTOM } from "../types";

/**
 * Slide 1 — the hook.
 *
 * Deliberately uses things Satori cannot do, so the migration is worth its cost:
 * a CSS grid stat row, a real multi-stop gradient scrim, a mask that fades the
 * photo into the panel, and `letter-spacing` on a display serif.
 */
export const ListingCard: React.FC<SlideProps> = ({ listing, brand, theme, photos }) => {
  const hero = photos[0];

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, fontFamily: theme.bodyFont }}>
      <div style={{ position: "absolute", inset: 0, height: 900 }}>
        {/* Remotion's Img, not a plain <img>: it blocks the capture until the
            photo has decoded. A plain tag renders whatever has loaded by the
            time the screenshot fires, which is a blank panel often enough to
            matter and never throws. */}
        <Img src={hero} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        {/* A soft fade into the panel rather than a hard seam. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 30%, ${theme.bg} 100%)`,
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          top: 56,
          left: 56,
          right: 56,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <span
          style={{
            background: theme.bg,
            color: theme.accent,
            borderRadius: 999,
            padding: "16px 32px",
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {listing.badge}
        </span>
        <span
          style={{
            background: theme.accent,
            color: theme.onAccent,
            borderRadius: 999,
            padding: "16px 32px",
            fontSize: 34,
            fontWeight: 700,
            boxShadow: "0 8px 32px rgba(0,0,0,0.28)",
          }}
        >
          {listing.price}
        </span>
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: SAFE_BOTTOM,
          padding: "0 64px",
          display: "flex",
          flexDirection: "column",
          gap: 36,
        }}
      >
        <div>
          <div
            style={{
              color: theme.ink,
              fontSize: 72,
              lineHeight: 1.05,
              fontFamily: theme.headingFont,
              fontWeight: theme.headingWeight,
              letterSpacing: "-0.02em",
            }}
          >
            {listing.address}
          </div>
          <div style={{ color: theme.inkMuted, fontSize: 34, marginTop: 12 }}>
            {listing.cityStateZip}
          </div>
        </div>

        {/* CSS Grid — the thing Satori throws on. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${listing.stats.length}, 1fr)`,
            borderTop: `1px solid ${theme.line}`,
            paddingTop: 28,
          }}
        >
          {listing.stats.map((stat) => (
            <div key={stat.label}>
              <div
                style={{
                  color: theme.accent,
                  fontSize: 56,
                  fontFamily: theme.headingFont,
                  fontWeight: theme.headingWeight,
                  lineHeight: 1,
                }}
              >
                {stat.value}
              </div>
              <div
                style={{
                  color: theme.inkMuted,
                  fontSize: 24,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginTop: 8,
                }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span
            style={{
              color: theme.ink,
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {brand.brokerage}
          </span>
          <span style={{ color: theme.accent, fontSize: 26 }}>{brand.handle}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
