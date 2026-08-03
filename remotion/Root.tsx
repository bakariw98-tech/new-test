import React from "react";
import { Composition } from "remotion";
import "./fonts";
import { ListingCard } from "./slides/ListingCard";
import { TourSlide } from "./slides/TourSlide";
import { ClosingSlide } from "./slides/ClosingSlide";
import { ListingVideo, type ListingVideoProps } from "./video/ListingVideo";
import { FPS, planScenes, totalFrames } from "./video/timing";
import { CANVAS, type SlideProps } from "./types";
import { CarbonNeutral2030, TOTAL_FRAMES as BENCHMARK_FRAMES } from "./benchmark/CarbonNeutral2030";

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
const still = { durationInFrames: 1, fps: 30, width: CANVAS.width, height: CANVAS.height } as const;

const sampleVideoProps: ListingVideoProps = {
  ...sampleProps,
  media: [
    { url: "https://picsum.photos/seed/estate1/1600/1100.jpg", alt: "Front elevation at dusk" },
    { url: "https://picsum.photos/seed/estate2/1600/1100.jpg", alt: "Pool terrace at dusk" },
    { url: "https://picsum.photos/seed/estate3/1600/1100.jpg", alt: "Two-storey entry hall" },
    { url: "https://picsum.photos/seed/estate4/1600/1100.jpg", alt: "Aerial over the roofline" },
  ],
};

/**
 * Duration comes from the photo count, so a four-photo listing and a
 * twenty-photo listing both produce something watchable. Remotion calls this
 * before rendering, which is why the composition can declare a placeholder
 * length and still render the right one.
 */
const calculateVideoMetadata = ({ props }: { props: ListingVideoProps }) => ({
  durationInFrames: totalFrames(planScenes({ photos: props.media ?? [] })),
});

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="ListingCard" component={ListingCard} {...still} defaultProps={sampleProps} />
    <Composition
      id="TourSlide"
      component={TourSlide}
      {...still}
      defaultProps={{ ...sampleProps, caption: "A full pool terrace, hedged and lit", index: 2, total: 7 }}
    />
    <Composition id="ClosingSlide" component={ClosingSlide} {...still} defaultProps={sampleProps} />

    <Composition
      id="ListingVideo-9x16"
      component={ListingVideo}
      fps={FPS}
      width={1080}
      height={1920}
      durationInFrames={600}
      defaultProps={sampleVideoProps}
      calculateMetadata={calculateVideoMetadata}
    />
    <Composition
      id="ListingVideo-16x9"
      component={ListingVideo}
      fps={FPS}
      width={1920}
      height={1080}
      durationInFrames={600}
      defaultProps={sampleVideoProps}
      calculateMetadata={calculateVideoMetadata}
    />

    {/* Render-speed benchmark only — see remotion/benchmark/CarbonNeutral2030.tsx.
        Not a product composition; not wired into any user-facing MCP tool. */}
    <Composition
      id="CarbonNeutral2030Benchmark"
      component={CarbonNeutral2030}
      fps={FPS}
      width={1920}
      height={1080}
      durationInFrames={BENCHMARK_FRAMES}
    />
  </>
);
