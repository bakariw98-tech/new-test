import { describe, expect, test } from "vitest";
import { contrastRatio, resolveTheme } from "./resolve";
import { BASE_UNIT, THEMES, themeIdFromLegacyPreset } from "./tokens";
import type { ThemeId } from "../core/types";

const brandDefaults = { accentColor: null, headingFont: null, bodyFont: null };
const ids = Object.keys(THEMES) as ThemeId[];

describe("scale", () => {
  test("the same ratios produce medium-appropriate absolute sizes", () => {
    const carousel = resolveTheme({ themeId: "minimal", medium: "carousel" });
    const website = resolveTheme({ themeId: "minimal", medium: "website" });
    const print = resolveTheme({ themeId: "minimal", medium: "print" });

    expect(carousel.size.body).toBe(BASE_UNIT.carousel);
    expect(website.size.body).toBe(BASE_UNIT.website);
    expect(print.size.body).toBe(BASE_UNIT.print);

    // Same proportions everywhere — that is what makes the assets look related.
    for (const t of [carousel, website, print]) {
      expect(t.size.h1 / t.size.body).toBeCloseTo(1.75, 2);
      expect(t.size.caption / t.size.body).toBeCloseTo(0.85, 2);
    }
  });

  test("sizes descend from display to micro in every theme", () => {
    for (const id of ids) {
      const { size } = resolveTheme({ themeId: id, medium: "carousel" });
      expect(size.display).toBeGreaterThan(size.h1);
      expect(size.h1).toBeGreaterThan(size.h2);
      expect(size.h2).toBeGreaterThan(size.body);
      expect(size.body).toBeGreaterThan(size.caption);
      expect(size.caption).toBeGreaterThan(size.micro);
    }
  });
});

describe("brand overrides", () => {
  test("a valid accent replaces the theme accent", () => {
    const t = resolveTheme({
      themeId: "modern",
      medium: "carousel",
      brand: { ...brandDefaults, accentColor: "#0F62FE" },
    });
    expect(t.color.accent).toBe("#0F62FE");
  });

  test("a malformed accent is ignored rather than rendered", () => {
    for (const bad of ["red", "#12", "rgb(0,0,0)", "", "#GGGGGG"]) {
      const t = resolveTheme({
        themeId: "modern",
        medium: "carousel",
        brand: { ...brandDefaults, accentColor: bad },
      });
      expect(t.color.accent).toBe(THEMES.modern.color.accent);
    }
  });

  test("a font the renderer has not loaded is ignored", () => {
    const t = resolveTheme({
      themeId: "modern",
      medium: "carousel",
      brand: { ...brandDefaults, headingFont: "Comic Sans MS" as never },
    });
    expect(t.font.heading).toBe(THEMES.modern.font.heading);
  });

  test("DM Serif Display is forced to 400 because no 700 file exists", () => {
    const t = resolveTheme({
      themeId: "modern",
      medium: "carousel",
      brand: { ...brandDefaults, headingFont: "DM Serif Display" },
    });
    expect(t.font.heading).toBe("DM Serif Display");
    expect(t.font.headingWeight).toBe(400);
  });
});

describe("accent readability", () => {
  test("text on a custom accent stays legible", () => {
    // A pale accent must not keep a light onAccent, and vice versa.
    for (const accent of ["#FFE066", "#0B1F3A", "#FFFFFF", "#000000", "#B08D57"]) {
      for (const id of ids) {
        const t = resolveTheme({
          themeId: id,
          medium: "carousel",
          brand: { ...brandDefaults, accentColor: accent },
        });
        expect(contrastRatio(t.color.accent, t.color.onAccent)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test("every stock theme is legible on its own ground", () => {
    for (const id of ids) {
      const t = resolveTheme({ themeId: id, medium: "carousel" });
      expect(contrastRatio(t.color.bg, t.color.ink)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.color.accent, t.color.onAccent)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("muted ink still clears the large-text threshold", () => {
    for (const id of ids) {
      const t = resolveTheme({ themeId: id, medium: "carousel" });
      expect(contrastRatio(t.color.bg, t.color.inkMuted)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("legacy presets", () => {
  test("the published preset names still map to a theme", () => {
    expect(themeIdFromLegacyPreset("midnight")).toBe("modern");
    expect(themeIdFromLegacyPreset("estate")).toBe("luxury");
    expect(themeIdFromLegacyPreset("gallery")).toBe("minimal");
  });

  test("an unknown name falls back rather than throwing", () => {
    expect(themeIdFromLegacyPreset("nonsense")).toBe("minimal");
  });
});
