import React from "react";
import { Composition } from "remotion";
import { ListingCard } from "./slides/ListingCard";
import { CANVAS, type SlideProps } from "./types";

const sampleProps: SlideProps = {
  listing: {
    badge: "Just listed",
    price: "$24,500,000",
    address: "9541 Sunset Blvd",
    cityStateZip: "Beverly Hills, CA 90210",
    stats: [
      { label: "Beds", value: "8" },
      { label: "Baths", value: "9" },
      { label: "Sq Ft", value: "9,500" },
    ],
  },
  brand: {
    brokerage: "Aurora Estates",
    handle: "@auroraestates",
    cta: "Book a private showing",
  },
  theme: {
    bg: "#12100E",
    surface: "#221E19",
    ink: "#F7F3EC",
    inkMuted: "#A9A096",
    accent: "#B08D57",
    onAccent: "#12100E",
    line: "#3A342C",
    headingFont: "Playfair Display, Georgia, serif",
    bodyFont: "Inter, system-ui, sans-serif",
    headingWeight: 700,
  },
  photos: ["https://picsum.photos/seed/estate1/1600/1100.jpg"],
};

/**
 * A still is a one-frame composition. Video slides later reuse the same
 * components and only add a duration and timing hooks — that is the whole
 * reason for adopting Remotion rather than plain Chromium.
 */
export const RemotionRoot: React.FC = () => (
  <Composition
    id="ListingCard"
    component={ListingCard}
    durationInFrames={1}
    fps={30}
    width={CANVAS.width}
    height={CANVAS.height}
    defaultProps={sampleProps}
  />
);
