# Component contract

Satori renders a CSS subset (flexbox only, inline styles, no grid, no `<br>`).
The website is real React. The PDF is print CSS. **These cannot share React
components.** Anything that claims otherwise breaks the first time a `<div>`
with `display: grid` reaches the carousel renderer.

What they share instead:

1. **Tokens** — `lib/design/tokens.ts`, resolved per medium by `resolveTheme`.
2. **Content** — `context.formatted`, computed once in `lib/core/format.ts`.
3. **This document** — the component vocabulary. Each medium implements the same
   named components with the same props against the same tokens.

A component is "done" in a medium when it takes the props below, reads only
`theme.*` for style, and reads only `context.formatted.*` for text.

Sizes below are token names, never numbers. `theme.size.h1`, not `63px`.

---

## BrandMark

The brokerage attribution carried on every asset, so a screenshot stays
attributed to the customer.

| prop | type | notes |
|---|---|---|
| `label` | `string` | `context.formatted.brandMark`, already uppercased |
| `tone` | `"ink" \| "muted" \| "onPhoto"` | picks `color.ink` / `color.inkMuted` / `color.ink` |

- Size `theme.size.micro`, weight 700, letter-spacing ~0.06em.
- Never larger than `caption`. It is a signature, not a headline.

## PriceBadge

| prop | type | notes |
|---|---|---|
| `price` | `string` | `formatted.price`, or `formatted.priceShort` when `compact` |
| `compact` | `boolean` | true in tight frames (story, QR card) |

- Background `color.accent`, text `color.onAccent`, radius `radius.pill`.
- Size `theme.size.caption`, weight 700.
- `onAccent` is already contrast-checked against a brand's custom accent — do
  not substitute white.

## StatRow

Beds / Baths / Sq Ft.

| prop | type | notes |
|---|---|---|
| `stats` | `Stat[]` | `formatted.stats` — **length varies**, sq ft is dropped when absent |

- Value at `theme.size.h2` in `color.ink`; label at `theme.size.micro` in
  `color.inkMuted`, directly beneath.
- Distribute along the main axis with `space-between`. Do not hardcode three
  columns — a listing without square footage renders two.

## AgentCard

| prop | type | notes |
|---|---|---|
| `name` | `string` | `brand.agentName` |
| `title` | `string \| null` | |
| `headshotUrl` | `string \| null` | render text-only when null, never a placeholder avatar |
| `phone`, `email` | `string \| null` | omit the row entirely when null |
| `brokerage` | `string` | |

- Headshot is a circle at roughly `space[7]` square on screen.
- Name at `theme.size.h2`, everything else at `theme.size.caption`.

## CTAButton

| prop | type | notes |
|---|---|---|
| `label` | `string` | `brand.ctaText` |
| `href` | `string \| null` | null on the carousel — there are no links in a PNG |

- Background `color.accent`, text `color.onAccent`, radius `radius.pill`.
- Size `theme.size.caption`, weight 700.
- On the website this is a real `<a>`; on the carousel and flyer it is a pill
  that tells the reader what to do next.

## FeatureList

| prop | type | notes |
|---|---|---|
| `features` | `string[]` | `listing.features` |
| `columns` | `1 \| 2` | 2 on wide media, 1 on the carousel |

- Marker is a `color.accent` dot, never a bullet glyph — glyph coverage varies
  by font and a missing one renders as tofu.
- Item text at `theme.size.body`, gap `space[3]`.

## PhotoPanelSeam

How a photo meets a panel. This is the theme's `motif`, and it is the single
biggest reason three themes read as three designs rather than three palettes.

| `motif` | treatment |
|---|---|
| `curve` | Cubic Bezier sweep filled in the panel colour, accent stroke tracing it |
| `rule` | Flat edge with a thin `color.accent` rule directly above it |
| `none` | Flat edge, no ornament |

On the carousel the curve is an inline `<svg><path>` — Satori renders SVG
natively, and unlike `clip-path` it does not require `display:flex` on the same
element. On the website it is a `border-radius` or an SVG mask. In print it is
a flat rule, because a curve that bleeds off a trimmed page is a reprint.

---

## Instagram safe area

Applies to every 1080×1350 render: Instagram's UI covers roughly the bottom
200px. Meaningful content stays above **260px** from the bottom edge
(`SAFE_BOTTOM`). The linter warns on anything pinned below that.

Separately, a curved footer's top edge sits `CURVE_LIP` (90px) *lower* at the
left and right than in the middle. Text starts at the left, so content must
clear `footerTop + CURVE_LIP` or its first line lands on the photo. Both of
these are invisible in code review and obvious in the rendered pixels — look at
the image.
