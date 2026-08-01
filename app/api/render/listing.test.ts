import { describe, expect, test } from "vitest";
import { __geometry, closingSlide, listingCard, PRESETS, SAFE_BOTTOM, tourSlide } from "./listing";
import type { PresetName } from "./listing";

const presets: PresetName[] = ["midnight", "estate", "gallery"];

const listing = {
  badge: "JUST LISTED",
  price: "$8,495,000",
  street: "1166 San Ysidro Dr",
  cityState: "Beverly Hills, CA 90210",
  beds: "5",
  baths: "6",
  sqft: "5,207",
};
const brand = { brokerage: "Aurora Estates", handle: "@auroraestates", contact: "DM to book" };

/**
 * Approximate rendered height of a text block. Satori's real measurement is not
 * available here, so these are deliberate over-estimates — the assertions below
 * only need to prove content clears the seam with margin.
 */
function textHeight(fontSize: number, lines: number, lineHeight = 1.15): number {
  return Math.ceil(fontSize * lineHeight * lines);
}

describe("footer geometry", () => {
  test("a two-line caption still starts below the seam on every theme", () => {
    for (const preset of presets) {
      const theme = __geometry.carouselTheme(preset);
      const footer = __geometry.photoFooter(theme, 620);

      const contentHeight =
        textHeight(theme.size.h1, 2) + theme.space[3] + textHeight(theme.size.micro, 1);
      const contentTop = __geometry.CANVAS.height - SAFE_BOTTOM - contentHeight;

      expect(contentTop).toBeGreaterThan(footer.contentTop);
    }
  });

  test("the closing slide's four stacked elements clear the seam", () => {
    for (const preset of presets) {
      const theme = __geometry.carouselTheme(preset);
      const footer = __geometry.photoFooter(theme, 700);

      const contentHeight =
        textHeight(theme.size.h1, 1, 1.12) +
        theme.space[2] +
        textHeight(theme.size.caption, 1) +
        theme.space[3] +
        theme.space[3] * 2 +
        textHeight(theme.size.caption, 1) +
        theme.space[3] +
        textHeight(theme.size.micro, 1);
      const contentTop = __geometry.CANVAS.height - SAFE_BOTTOM - contentHeight;

      expect(contentTop).toBeGreaterThan(footer.contentTop);
    }
  });

  test("the curve's lip is the lowest point of a curved footer", () => {
    const curved = __geometry.carouselTheme("gallery");
    expect(curved.motif).toBe("curve");
    const footer = __geometry.photoFooter(curved, 620);
    expect(footer.contentTop).toBe(__geometry.CANVAS.height - 620 + __geometry.CURVE_LIP);
  });
});

describe("slide markup", () => {
  test("nothing is pinned inside Instagram's safe area", () => {
    const slides = presets.flatMap((preset) => [
      listingCard({ photo: "https://example.com/a.jpg", listing, brand, preset }),
      tourSlide({ photo: "https://example.com/a.jpg", caption: "Chef's kitchen", brand, preset }),
      closingSlide({ photo: "https://example.com/a.jpg", listing, brand, preset }),
    ]);

    for (const markup of slides) {
      for (const match of markup.matchAll(/bottom:(\d+)px/g)) {
        expect(Number(match[1])).toBeGreaterThanOrEqual(SAFE_BOTTOM);
      }
    }
  });

  test("every img is sized in its style attribute", () => {
    // HTML width/height attributes are dropped on the way to Satori, so an
    // image sized only that way renders as nothing, silently, with a 200.
    const markup = listingCard({ photo: "https://example.com/a.jpg", listing, brand });
    for (const tag of markup.match(/<img[^>]*>/g) ?? []) {
      expect(tag).toMatch(/style="[^"]*width:\d+px/);
      expect(tag).toMatch(/style="[^"]*height:\d+px/);
    }
  });

  test("photos are routed through the normaliser, never linked directly", () => {
    const markup = tourSlide({ photo: "https://example.com/a.webp", brand });
    expect(markup).toContain("/api/image?src=");
    expect(markup).not.toContain('src="https://example.com/a.webp"');
  });

  test("a bare Drive file id is passed as drive=, not src=", () => {
    const markup = tourSlide({ photo: "1c7CP_0L6S9ViAPddNaGdYI7mti4ACYgM", brand });
    expect(markup).toContain("drive=1c7CP_0L6S9ViAPddNaGdYI7mti4ACYgM");
  });

  test("caller text is escaped", () => {
    const markup = listingCard({
      listing: { ...listing, street: '<script>"x"' },
      brand,
    });
    expect(markup).not.toContain("<script>");
    expect(markup).toContain("&lt;script&gt;&quot;x&quot;");
  });

  test("a listing without square footage renders two stats, not a dash", () => {
    const markup = listingCard({ listing: { ...listing, sqft: undefined }, brand });
    expect(markup).toContain(">Beds<");
    expect(markup).toContain(">Baths<");
    expect(markup).not.toContain(">Sq Ft<");
  });

  test("no slide emits CSS grid or a class attribute", () => {
    for (const preset of presets) {
      const markup = closingSlide({ photo: "https://example.com/a.jpg", listing, brand, preset });
      expect(markup).not.toMatch(/display\s*:\s*grid/);
      expect(markup).not.toMatch(/\sclass(Name)?=/);
    }
  });
});

describe("legacy preset resource", () => {
  test("still exposes the three published names", () => {
    expect(Object.keys(PRESETS).sort()).toEqual(["estate", "gallery", "midnight"]);
  });

  test("values come from the tokens rather than a second colour table", () => {
    expect(PRESETS.midnight.theme).toBe("modern");
    expect(PRESETS.estate.theme).toBe("luxury");
    expect(PRESETS.gallery.theme).toBe("minimal");
    expect(PRESETS.midnight.accentColor).toBe(__geometry.carouselTheme("midnight").color.accent);
  });
});
