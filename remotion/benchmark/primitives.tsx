/**
 * Small, parametrized pieces the benchmark composition's 68 beats compose
 * from, rather than one-off markup per beat. Visual fidelity to the real ad
 * is not the point — comparable per-frame render complexity is — so these are
 * generic abstract shapes, not sourced or reproduced brand assets.
 */

import React from "react";
import { Easing, interpolate } from "remotion";
import type { Color, Shape } from "./beats";

export const FG: Record<Color, string> = {
  black: "#000000",
  white: "#FFFFFF",
  green: "#00FF00",
};

export const BG = {
  white: "#F5F5F7",
  black: "#000000",
  green: "#00FF00",
} as const;

export const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/** 0-1 over the given frame window, clamped — the one interpolate shape every entrance in this file shares. */
export function enter(frame: number, from: number, dur: number): number {
  return interpolate(frame, [from, from + dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
}

/**
 * The Apple-logo substitute. A generic abstract mark — a plain circle with a
 * small notch and an optional leaf accent — not a reproduction of any real
 * trademarked silhouette.
 */
export const Wordmark: React.FC<{ color: Color; leaf?: boolean; size?: number }> = ({
  color,
  leaf,
  size = 84,
}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{ flex: "none" }}>
    <path
      d="M50 12 C74 12 90 32 90 56 C90 80 72 92 50 92 C28 92 10 80 10 56 C10 32 26 12 50 12 Z M50 12 C44 4 38 -2 50 4"
      fill={FG[color]}
    />
    {leaf ? (
      <path d="M50 4 C60 4 66 12 62 20 C54 20 48 14 50 4 Z" fill={FG.green} />
    ) : null}
  </svg>
);

const shapeSize = 72;

/** One SVG per generic shape id, each accepting an entrance progress 0-1. */
export const ShapeGlyph: React.FC<{ shape: Shape; color: Color; progress: number }> = ({
  shape,
  color,
  progress,
}) => {
  const c = FG[color];
  const common = { style: { flex: "none" as const } };

  switch (shape) {
    case "chevron":
      return (
        <svg width={shapeSize} height={shapeSize} viewBox="0 0 100 100" {...common}>
          <path
            d="M30 20 L70 50 L30 80"
            stroke={c}
            strokeWidth={12}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: progress }}
          />
        </svg>
      );
    case "arrow":
    case "double-arrow":
      return (
        <svg width={shapeSize * (shape === "double-arrow" ? 1.6 : 1)} height={shapeSize} viewBox="0 0 140 100" {...common}>
          <path
            d="M10 50 H110 M80 20 L110 50 L80 80"
            stroke={c}
            strokeWidth={10}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={140}
            strokeDashoffset={140 * (1 - progress)}
          />
          {shape === "double-arrow" ? (
            <path
              d="M10 50 H110 M80 20 L110 50 L80 80"
              stroke={c}
              strokeWidth={10}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              transform="translate(0 0)"
              style={{ opacity: progress * 0.5 }}
            />
          ) : null}
        </svg>
      );
    case "underline":
    case "line":
      return (
        <svg width={140} height={16} viewBox="0 0 140 16" {...common}>
          <rect x={0} y={4} width={140 * progress} height={8} fill={c} rx={4} />
        </svg>
      );
    case "square-outline":
      return (
        <svg width={shapeSize} height={shapeSize} viewBox="0 0 100 100" {...common}>
          <rect
            x={10}
            y={10}
            width={80}
            height={80}
            rx={14}
            stroke={c}
            strokeWidth={8}
            fill="none"
            style={{ opacity: progress }}
          />
        </svg>
      );
    case "square-checked":
      return (
        <svg width={shapeSize} height={shapeSize} viewBox="0 0 100 100" {...common}>
          <rect x={10} y={10} width={80} height={80} rx={14} stroke={c} strokeWidth={8} fill="none" />
          <path
            d="M28 52 L44 68 L74 34"
            stroke={c}
            strokeWidth={10}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={70}
            strokeDashoffset={70 * (1 - progress)}
          />
        </svg>
      );
    case "device-outline":
      return (
        <svg width={shapeSize * 0.7} height={shapeSize} viewBox="0 0 70 100" {...common}>
          <rect
            x={5}
            y={5}
            width={60}
            height={90}
            rx={10}
            stroke={c}
            strokeWidth={7}
            fill="none"
            strokeDasharray={310}
            strokeDashoffset={310 * (1 - progress)}
          />
        </svg>
      );
    case "burst":
    case "dashed-burst":
      return (
        <svg width={shapeSize} height={shapeSize} viewBox="0 0 100 100" {...common}>
          {Array.from({ length: 8 }, (_, i) => {
            const angle = (i / 8) * Math.PI * 2;
            const r1 = 22;
            const r2 = 22 + 26 * progress;
            return (
              <line
                key={i}
                x1={50 + Math.cos(angle) * r1}
                y1={50 + Math.sin(angle) * r1}
                x2={50 + Math.cos(angle) * r2}
                y2={50 + Math.sin(angle) * r2}
                stroke={c}
                strokeWidth={6}
                strokeLinecap="round"
                strokeDasharray={shape === "dashed-burst" ? "4 6" : undefined}
                style={{ opacity: progress }}
              />
            );
          })}
        </svg>
      );
    case "dot-grid":
      return (
        <svg width={shapeSize} height={shapeSize} viewBox="0 0 100 100" {...common}>
          {Array.from({ length: 9 }, (_, i) => {
            const x = 20 + (i % 3) * 30;
            const y = 20 + Math.floor(i / 3) * 30;
            // Staggered pop-in: each dot's own window is a 1/9th slice of the shared progress.
            const local = enter(progress, i / 9, 1 / 9);
            return <circle key={i} cx={x} cy={y} r={8 * local} fill={c} opacity={local} />;
          })}
        </svg>
      );
    case "circle-rings":
      return (
        <svg width={shapeSize} height={shapeSize} viewBox="0 0 100 100" {...common}>
          <circle cx={50} cy={50} r={20} stroke={c} strokeWidth={6} fill="none" style={{ opacity: progress }} />
          <circle
            cx={50}
            cy={50}
            r={38}
            stroke={c}
            strokeWidth={5}
            fill="none"
            strokeDasharray={239}
            strokeDashoffset={239 * (1 - progress)}
          />
        </svg>
      );
    case "building":
      return (
        <svg width={shapeSize} height={shapeSize} viewBox="0 0 100 100" {...common}>
          <rect
            x={15}
            y={40}
            width={70}
            height={50}
            fill={c}
            style={{ opacity: progress, transformOrigin: "50% 100%", scale: `${0.6 + 0.4 * progress}` }}
          />
          <rect x={30} y={15} width={12} height={30} fill={c} style={{ opacity: progress }} />
        </svg>
      );
    case "pointer":
      return (
        <svg width={shapeSize * 0.6} height={shapeSize} viewBox="0 0 60 100" {...common}>
          <path d="M15 10 L15 75 L32 60 L45 90 L55 85 L42 55 L62 55 Z" fill={c} style={{ opacity: progress }} />
        </svg>
      );
    default:
      return null;
  }
};
