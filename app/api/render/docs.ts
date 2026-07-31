/**
 * Authoring context served to connected agents.
 *
 * This is exposed three ways, because different clients pick up context
 * differently: summarised in the `render_image` tool description, readable in
 * full as the `render://guide` and `render://examples` MCP resources, and
 * returned inline whenever a render fails so the agent can self-correct without
 * having to go looking.
 */

export const GUIDE = `# Writing markup for render_image

You are writing HTML that gets rasterised to PNG by Satori, not by a browser.
Most of what you know about CSS applies. The differences below are the ones that
actually cause failures.

## The five rules that matter

1. **Inline \`style\` attributes only.** No \`<style>\` blocks, no stylesheets, no
   \`class\`. A \`class\` attribute is silently ignored, so styling quietly vanishes.
2. **Any element with two or more children must set \`display: flex\`** (or
   \`display: none\` / \`display: contents\`). This is the single most common error.
   When in doubt, put \`display: flex\` on every container you write.
3. **Flexbox only — no CSS grid.** \`display: grid\` throws. Use nested flex rows
   and columns.
4. **No \`<br>\`.** It throws. For a line break, use separate flex children in a
   column, or \`white-space: pre-wrap\` with a real newline in the text.
5. **Images need an absolute \`https://\` URL or a \`data:\` URI**, and must be sized
   **in \`style\`** — \`style="width:1080px;height:1350px"\`. The HTML \`width\` and
   \`height\` *attributes* are silently ignored, and an unsized image renders as
   nothing at all. See "Images" below, because the failure mode here is quiet.

## Layout

Your markup is placed inside an implicit wrapper that is already
\`display: flex; flex-direction: column; width: 100%; height: 100%\`. So a single
root \`<div>\` sized \`width: 100%; height: 100%\` fills the canvas exactly.

Supported: \`display: flex\`, \`flexDirection\`, \`justifyContent\`, \`alignItems\`,
\`alignSelf\`, \`flexWrap\`, \`flexGrow\`, \`flexShrink\`, \`flexBasis\`, \`gap\`,
\`position: relative | absolute\` with \`top\`/\`right\`/\`bottom\`/\`left\`, \`zIndex\`,
\`padding\`, \`margin\`, \`width\`, \`height\`, \`min*\`/\`max*\`, \`overflow: visible | hidden\`.

Not supported: grid, float, \`position: fixed\`, \`position: sticky\`.

**\`transform\` and \`clip-path\` need \`display: flex\` on that same element**, even
if it has no children. Satori wraps a transformed or clipped element internally,
and without an explicit \`display\` the wrapper trips the same "more than one
child" error used for real layout mistakes — which reads as a markup problem
when it is really this one specific quirk:

\`\`\`html
<!-- throws "more than one child node", even though this div has none -->
<div style="width:200px;height:200px;background:#0ff;transform:rotate(8deg)"></div>

<!-- fixed -->
<div style="display:flex;width:200px;height:200px;background:#0ff;transform:rotate(8deg)"></div>
\`\`\`

Both work well for genuine dynamism when the default centered-rectangle look is
too static: \`clip-path: polygon(...)\` cuts an image or panel on a diagonal
instead of a flat edge, and a small \`transform: rotate(-3deg)\` on a badge or
chip reads as an intentional accent. Keep rotation off anything that has to be
read at a glance — prices, addresses, a call-to-action button — and reserve it
for decorative elements: tags, corner accents, photo captions' backing chips.

**Children stretch by default.** In a \`flex-direction: column\`, every child fills
the full width unless told otherwise. A pill button or badge written without
\`align-self: flex-start\` will span the entire slide and look wrong:

\`\`\`html
<!-- stretches edge to edge -->
<div style="display:flex;background:#22d3ee;border-radius:9999px;padding:20px 36px">CTA</div>

<!-- hugs its content, which is almost always what you want -->
<div style="display:flex;align-self:flex-start;background:#22d3ee;border-radius:9999px;padding:20px 36px">CTA</div>
\`\`\`

## Text

\`fontFamily\`, \`fontSize\`, \`fontWeight\`, \`lineHeight\`, \`letterSpacing\`,
\`textAlign\`, \`textTransform\`, \`textDecoration\`, \`textShadow\`,
\`textOverflow: ellipsis\`, \`whiteSpace\`, \`color\`.

**Available fonts.** Anything else silently falls back, so do not design around a
font that is not on this list. There is no italic.

| Family | Weights | Feel |
| --- | --- | --- |
| \`Inter\` | 400, 700 | Neutral UI sans. Safe default. |
| \`Poppins\` | 400, 700 | Geometric sans, rounder and friendlier. |
| \`Playfair Display\` | 400, 700 | High-contrast serif. Reads upmarket. |
| \`DM Serif Display\` | 400 | Display serif for headlines only — no bold, so do not set font-weight 700 on it. |

A common pairing is a serif headline over a sans body: \`Playfair Display\` 700 for
the big line, \`Inter\` 400 underneath.

Units: \`px\` is the reliable choice. \`rem\` resolves against a 16px root
(\`3rem\` = 48px). Percentages work for layout dimensions.

## Images

This is where most silent failures come from, so it is worth being precise.

\`\`\`html
<!-- correct: sized in style -->
<img src="https://example.com/hero.jpg" style="width:1080px;height:1350px;object-fit:cover" />

<!-- broken: HTML attributes are ignored, renders nothing -->
<img src="https://example.com/hero.jpg" width="1080" height="1350" />
\`\`\`

- Size via \`style\`, always. An \`<img>\` with no \`style\` width/height renders as
  **nothing** — no error, just an image-shaped hole where you expected a photo.
- The source must be an absolute \`https://\` URL or a \`data:\` URI. Relative paths
  never resolve.
- A bad image URL fails in one of two ways: sometimes it errors with "Image size
  cannot be determined", and sometimes the render simply **succeeds with the image
  missing**. Either way, a slide that looks emptier than you expected is almost
  always a bad image URL. This tool fetches image URLs before rendering and will
  name the broken one, but a URL that works once can still fail later.
- \`object-fit: cover\` works and is usually what you want for a photo background.
- **Formats: PNG, JPEG, GIF, SVG only. WebP and AVIF do not decode** — and they
  fail with a misleading "Image size cannot be determined" error rather than
  anything about the format. Since most modern exports and stock photos are WebP,
  this comes up constantly.
- For anything that is not already PNG or JPEG, or that needs resizing, route it
  through the normaliser:

  \`\`\`html
  <img src="/api/image?src=https%3A%2F%2Fexample.com%2Fphoto.webp&w=1080&h=820"
       style="width:1080px;height:820px;object-fit:cover" />
  \`\`\`

  \`/api/image\` fetches the source, converts to JPEG (or \`&fmt=png\`), optionally
  resizes with \`w\`/\`h\`/\`fit\`, and caches the result immutably. Pre-sizing a large
  photo there is much cheaper than making the renderer scale it on every call.
  It also accepts Google Drive share links directly and rewrites them to a
  direct-content URL — but the file must be shared as "anyone with the link",
  because a private file is not fetchable by the server.
- To lay text over a photo, absolutely position the image, then a gradient scrim,
  then the text — see example 4 in \`render://examples\`.

### Getting an image in

Renders happen server-side, so the server has to be able to reach the image. It
has no access to your files, your Drive, or your machine.

**Give it a URL.** This is the normal path and the only one that scales. If the
image lives somewhere private, whoever holds that access — you, the user, or
another agent with a Drive or storage connector — exports it or makes it
link-readable first, then passes the URL here.

**Do not route image bytes through yourself.** Fetching a photo in order to
re-send it as a data URI does not work: a 500 KB photo is roughly 700,000
characters base64, so a single image can exhaust a context window, and the markup
limit rejects it anyway. Data URIs are viable only for genuinely small assets —
logos, icons, marks under about 50 KB.

**If the URL 502s here**, it is almost always still private. A Google Drive link
that has not been shared returns an HTML sign-in page rather than image bytes,
and \`/api/image\` will say so explicitly.

## Colour, background, effects

\`background\` / \`backgroundColor\`, \`linear-gradient(...)\`, \`radial-gradient(...)\`,
\`backgroundImage: url(...)\` with an absolute URL, \`backgroundSize\`,
\`backgroundPosition\`, \`backgroundClip\`, \`border\` and per-side borders,
\`borderRadius\`, \`boxShadow\`, \`opacity\`, \`transform\` (translate, rotate, scale,
skew), \`clipPath\`, \`maskImage\`.

\`filter\` supports \`blur\`, \`brightness\`, \`contrast\`, \`grayscale\`, \`invert\`,
\`saturate\`, \`sepia\`. Treat these as stylisation, not colour grading — there are
no LUTs, curves, or per-channel controls.

## Sizes

| Preset | Pixels | Use |
| --- | --- | --- |
| \`ig-portrait\` | 1080x1350 | Carousel slides and feed posts. Best default: takes the most vertical feed space. |
| \`ig-square\` | 1080x1080 | Square feed posts. |
| \`ig-story\` | 1080x1920 | Stories and Reels covers. |
| \`og\` | 1200x630 | Link preview cards. |

Or pass explicit \`width\` and \`height\` up to 4096.

## Making a carousel that works

For property posts, prefer the \`render_listing_carousel\` tool — it applies all of
this automatically and needs data rather than markup. What follows matters when
composing something by hand.

These are the rules that separate a post that performs from one that looks
almost right:

1. **Keep content above the bottom ~260px.** Instagram's UI covers roughly the
   bottom 15% of a 4:5 frame. A caption sitting at 84% down looks fine in
   isolation and gets clipped in the feed.
2. **The last slide must ask for something specific**, with the means to act
   visible on it — a handle, a phone number, "DM to book". A carousel that ends
   on a nice photo wastes the attention it earned.
3. **Put the brand on every slide.** Any slide can be screenshotted and reshared
   on its own; an unattributed one is free advertising for nobody.
4. **Match the scrim to the palette.** A light look needs a light scrim with dark
   type; a dark look needs the reverse. A dark scrim under dark text is
   invisible, and the render will not warn you.
5. **Beware captions over busy areas.** A scrim cannot create contrast where the
   photo is already the same tone as the type. If the bottom third is bright and
   detailed, either strengthen the scrim or move the caption.
6. **One visual system across the set.** Same palette, same type scale, same
   spacing on every slide, or it reads as separate posts stuck together.

## Designing for Instagram

- Every slide in a carousel must be the **same aspect ratio**, or Instagram crops
  them inconsistently. Pick one preset and keep it.
- Keep meaningful content out of the **bottom ~15%** — the app's UI overlays it.
- Carousels take up to 20 slides. Slide 1 carries the hook; it is the only one
  most people see.
- At 1080px wide, body text below ~28px is hard to read on a phone. Headlines
  usually want 72-120px.
- Padding of 80-100px reads as deliberate. Less looks cramped at this size.

## What you get back

By default \`render_image\` returns a **URL**, not the image bytes.

That is deliberate. A 1080x1350 PNG is a couple of megabytes, which is millions of
characters once base64-encoded — one slide would consume an entire context window,
and a ten-slide carousel is simply impossible. So the bytes stay server-side and
you get a reference.

Practical consequences:

- To hand a render to another tool — a Drive upload, a message, a download — pass
  **the URL**. Do not fetch the bytes in order to relay them.
- Use \`output: "inline"\` only when a person needs to *look* at the image in the
  conversation. It is expensive, so it is never the right choice for a pipeline.
- \`output: "both"\` exists for the case where someone wants to see it and you also
  need the URL for a later step.

The URL comes from one of two backends, transparently:

- **Vercel Blob**, if \`BLOB_READ_WRITE_TOKEN\` is set on the deployment. Short,
  permanent, CDN-backed, content-addressed so identical renders dedupe.
- Otherwise a **self-describing URL** that carries the compressed markup in its
  query string and re-renders on fetch. No storage to provision, and the result is
  immutably cacheable, but the URL is long — a few hundred to a couple of thousand
  characters. Still three orders of magnitude smaller than the PNG.

## Scale

At 1080x1350 a typical slide is 100-200 KB of PNG and renders in well under a
second. Composing a 10-slide carousel is ten cheap calls, not ten image
generations — that is the entire point of this tool.

Because renders return URLs rather than bytes, a ten-slide carousel costs about
as much context as ten short lines of text. That is what makes the batch case
practical at all.
`;

export const EXAMPLES = `# Working render_image examples

Every example here has been rendered successfully. Copy the structure and swap
the content.

## 1. Hook slide

Big type, gradient background, pill call to action. Use for slide 1.

\`\`\`html
<div style="display:flex;flex-direction:column;justify-content:space-between;width:100%;height:100%;background:linear-gradient(150deg,#0f172a 0%,#1e293b 55%,#0b1220 100%);padding:96px 88px;font-family:Inter">
  <div style="display:flex;align-items:center;gap:16px">
    <div style="display:flex;width:14px;height:14px;border-radius:9999px;background:#22d3ee"></div>
    <div style="display:flex;color:#94a3b8;font-size:28px;letter-spacing:6px">CAROUSEL / 01</div>
  </div>
  <div style="display:flex;flex-direction:column">
    <div style="display:flex;color:#f8fafc;font-size:104px;font-weight:700;line-height:1.05;letter-spacing:-3px">Stop paying twice for the same image.</div>
    <div style="display:flex;color:#94a3b8;font-size:38px;line-height:1.45;margin-top:36px">Generate the hero once. Compose every derivative in code.</div>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:flex-end">
    <div style="display:flex;color:#64748b;font-size:26px">@yourstudio</div>
    <div style="display:flex;background:#22d3ee;color:#04252c;font-size:26px;font-weight:700;padding:18px 32px;border-radius:9999px">SWIPE →</div>
  </div>
</div>
\`\`\`

## 2. Numbered list slide

Note that each row sets \`display:flex\`, and so does the column that holds them.

\`\`\`html
<div style="display:flex;flex-direction:column;width:100%;height:100%;background:#fafaf9;padding:96px 88px;font-family:Inter">
  <div style="display:flex;color:#0c0a09;font-size:76px;font-weight:700;letter-spacing:-2px;line-height:1.1">Three things that killed our margins</div>
  <div style="display:flex;flex-direction:column;gap:44px;margin-top:72px">
    <div style="display:flex;align-items:flex-start;gap:28px">
      <div style="display:flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:9999px;background:#0c0a09;color:#fafaf9;font-size:32px;font-weight:700">1</div>
      <div style="display:flex;color:#292524;font-size:38px;line-height:1.4;flex-shrink:1">Regenerating a variant instead of composing it</div>
    </div>
    <div style="display:flex;align-items:flex-start;gap:28px">
      <div style="display:flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:9999px;background:#0c0a09;color:#fafaf9;font-size:32px;font-weight:700">2</div>
      <div style="display:flex;color:#292524;font-size:38px;line-height:1.4;flex-shrink:1">Paying per slide for a ten slide carousel</div>
    </div>
    <div style="display:flex;align-items:flex-start;gap:28px">
      <div style="display:flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:9999px;background:#0c0a09;color:#fafaf9;font-size:32px;font-weight:700">3</div>
      <div style="display:flex;color:#292524;font-size:38px;line-height:1.4;flex-shrink:1">No way to reproduce last month's look</div>
    </div>
  </div>
</div>
\`\`\`

## 3. Quote slide

\`\`\`html
<div style="display:flex;flex-direction:column;justify-content:center;width:100%;height:100%;background:#1c1917;padding:110px 96px;font-family:Inter">
  <div style="display:flex;color:#f59e0b;font-size:140px;font-weight:700;line-height:0.8">"</div>
  <div style="display:flex;color:#fafaf9;font-size:60px;font-weight:700;line-height:1.25;letter-spacing:-1px;margin-top:24px">The asset you already paid for is the cheapest asset you will ever make again.</div>
  <div style="display:flex;color:#a8a29e;font-size:30px;margin-top:56px">— every studio that figured this out</div>
</div>
\`\`\`

## 4. Photo background with a scrim

The scrim is what keeps text legible over an arbitrary photo. \`position:absolute\`
layers it over the image; the text sits above that.

\`\`\`html
<div style="display:flex;position:relative;width:100%;height:100%;font-family:Inter">
  <img src="https://picsum.photos/1080/1350" style="position:absolute;top:0;left:0;width:1080px;height:1350px;object-fit:cover" />
  <div style="display:flex;position:absolute;top:0;left:0;width:1080px;height:1350px;background:linear-gradient(180deg,rgba(0,0,0,0.15) 0%,rgba(0,0,0,0.85) 100%)"></div>
  <div style="display:flex;flex-direction:column;justify-content:flex-end;position:absolute;top:0;left:0;width:1080px;height:1350px;padding:96px 88px">
    <div style="display:flex;color:#ffffff;font-size:92px;font-weight:700;line-height:1.05;letter-spacing:-2px">Shot once. Shipped nine times.</div>
    <div style="display:flex;color:#e7e5e4;font-size:34px;margin-top:28px">One hero frame, every format the client needed.</div>
  </div>
</div>
\`\`\`

## 5. Two column stat slide

\`\`\`html
<div style="display:flex;flex-direction:column;justify-content:center;width:100%;height:100%;background:#0f172a;padding:96px 88px;font-family:Inter">
  <div style="display:flex;color:#94a3b8;font-size:30px;letter-spacing:6px">THE MATH</div>
  <div style="display:flex;gap:48px;margin-top:64px">
    <div style="display:flex;flex-direction:column;flex-grow:1;background:#1e293b;border-radius:32px;padding:56px 44px">
      <div style="display:flex;color:#f8fafc;font-size:104px;font-weight:700;letter-spacing:-3px">1</div>
      <div style="display:flex;color:#94a3b8;font-size:30px;line-height:1.35;margin-top:16px">generation you pay for</div>
    </div>
    <div style="display:flex;flex-direction:column;flex-grow:1;background:#22d3ee;border-radius:32px;padding:56px 44px">
      <div style="display:flex;color:#04252c;font-size:104px;font-weight:700;letter-spacing:-3px">20</div>
      <div style="display:flex;color:#04252c;font-size:30px;line-height:1.35;margin-top:16px">slides you render free</div>
    </div>
  </div>
</div>
\`\`\`
`;

/** Compact rules embedded directly in the tool description. */
export const RULES_SUMMARY = [
  "Rules that cause hard failures if broken:",
  "1. Inline `style` attributes only. No <style> blocks, no stylesheets, no class attributes.",
  "2. Any element with 2+ children MUST set `display: flex`. This is the most common error.",
  "3. No CSS grid — `display: grid` throws. Nest flex rows and columns instead.",
  "4. No <br> — it throws. Use separate flex children, or white-space: pre-wrap with a newline.",
  "5. Images need an absolute https:// URL or a data: URI, plus explicit width and height.",
  "",
  "Fonts: Inter, Poppins, Playfair Display (400/700) and DM Serif Display (400 only). Any other font-family silently falls back.",
  "Read the `render://guide` and `render://examples` resources for the full CSS surface",
  "and copy-pasteable slide layouts.",
].join("\n");
