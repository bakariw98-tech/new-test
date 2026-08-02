import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { TitleScene } from "./scenes/TitleScene";
import { StatScene } from "./scenes/StatScene";
import { PhotoScene } from "./scenes/PhotoScene";
import { EndScene } from "./scenes/EndScene";
import { planScenes } from "./timing";
import type { SlideProps } from "../types";

export type ListingVideoProps = SlideProps & {
  /** Photos with their alt text, so a scene can caption honestly. */
  media: Array<{ url: string; alt?: string }>;
  /**
   * Not wired yet. Present so adding music or a voiceover later is a prop
   * rather than a refactor of every composition and render call.
   */
  soundtrack?: string;
};

/**
 * The listing video.
 *
 * One component for both orientations — the scenes read `useVideoConfig()` and
 * lay themselves out accordingly, so 1920x1080 and 1080x1920 stay in sync
 * instead of drifting as two parallel sets of files.
 */
export const ListingVideo: React.FC<ListingVideoProps> = (props) => {
  const scenes = planScenes({ photos: props.media });

  let at = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: props.theme.bg }}>
      {scenes.map((scene, i) => {
        const from = at;
        at += scene.durationInFrames;

        // Each scene overlaps the next by a few frames so the cross-fade has
        // something to fade into rather than cutting to black.
        const overlap = i === scenes.length - 1 ? 0 : 8;

        const shared = {
          ...props,
          photos: [scene.photo],
          durationInFrames: scene.durationInFrames + overlap,
        };

        return (
          <Sequence
            key={`${scene.kind}-${i}`}
            from={from}
            durationInFrames={scene.durationInFrames + overlap}
            layout="absolute-fill"
          >
            {scene.kind === "title" ? (
              <TitleScene {...shared} />
            ) : scene.kind === "stats" ? (
              <StatScene {...shared} />
            ) : scene.kind === "photo" ? (
              <PhotoScene {...shared} caption={scene.caption} sceneIndex={scene.index} />
            ) : (
              <EndScene {...shared} />
            )}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
