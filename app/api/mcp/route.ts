import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { renderToPng, SIZES } from "../render/render";
import { EXAMPLES, GUIDE, RULES_SUMMARY } from "../render/docs";
import { checkImageSources, explainRenderError, lintMarkup } from "../render/lint";
import { blobConfigured, selfDescribingUrl, uploadToBlob } from "../render/store";
import { DRIVE_SETUP_HINT, deleteFromDrive, driveMode, ensureFolderPath, uploadToDrive } from "../render/drive";
import { closingSlide, listingCard, PRESETS, SAFE_BOTTOM, tourSlide } from "../render/listing";

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "hello_world",
      {
        title: "Hello World",
        description:
          "Returns a friendly greeting. Use this to confirm the MCP connection is working end to end.",
        inputSchema: z.object({
          name: z
            .string()
            .min(1)
            .max(100)
            .default("world")
            .describe("Who to greet. Defaults to 'world'."),
        }),
      },
      async ({ name }) => ({
        content: [{ type: "text", text: `Hello, ${name}! 👋 This MCP server is alive.` }],
      }),
    );

    server.registerTool(
      "echo",
      {
        title: "Echo",
        description:
          "Echoes back whatever text it is given. Useful for checking that arguments survive the round trip.",
        inputSchema: z.object({
          message: z.string().min(1).max(4000).describe("Text to echo back verbatim."),
        }),
      },
      async ({ message }) => ({
        content: [{ type: "text", text: message }],
      }),
    );

    server.registerTool(
      "server_time",
      {
        title: "Server Time",
        description:
          "Returns the current UTC time as reported by the server, plus the region it ran in.",
        inputSchema: z.object({}),
      },
      async () => {
        const payload = {
          utc: new Date().toISOString(),
          region: process.env.VERCEL_REGION ?? "local",
          environment: process.env.VERCEL_ENV ?? "development",
        };
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        };
      },
    );

    server.registerTool(
      "render_image",
      {
        title: "Render Image",
        description: [
          "Renders HTML markup to a PNG and returns the image. Use this to compose social assets",
          "— Instagram carousel slides, stories, OG cards — in code rather than generating them",
          "with an image model. Generate a hero asset once, then derive every format from it here.",
          "",
          "Can also deliver straight to Google Drive (saveToDrive: true) instead of just returning",
          "a URL — see the saveToDrive/driveFolder/driveFolderId parameters below.",
          "",
          "For a real-estate listing specifically, prefer render_listing_carousel instead: it takes",
          "listing data and photos directly, with no markup to write. Read render://listing-guide",
          "before using it.",
          "",
          "Rendering is done by Satori, not a browser, so the CSS surface is a subset.",
          "",
          RULES_SUMMARY,
          "",
          "Sizes: ig-portrait 1080x1350 (best default, most feed space), ig-square 1080x1080,",
          "ig-story 1080x1920, og 1200x630. All slides in one carousel must share a size.",
          "",
          "By default this returns a fetchable image URL, not the image bytes. Pass that URL to",
          "whatever comes next — an upload tool, a message, a download. Do not ask for the bytes",
          "in order to hand them somewhere else; a single 1080x1350 PNG is megabytes, which is",
          "millions of characters as base64. Use output:'inline' only when a person needs to look",
          "at the result in the conversation.",
          "",
          "If a render fails, the error comes back with the specific fix and the full authoring",
          "guide, so correct the markup and call again rather than giving up.",
        ].join("\n"),
        annotations: {
          readOnlyHint: true,
          openWorldHint: false,
        },
        inputSchema: z.object({
          markup: z
            .string()
            .min(1)
            .max(100_000)
            .describe("HTML markup with inline styles. Root element must set `display: flex`."),
          size: z
            .enum(["ig-portrait", "ig-square", "ig-story", "og"])
            .default("ig-portrait")
            .describe(
              "Size preset: ig-portrait 1080x1350 (best for carousels), ig-square 1080x1080, ig-story 1080x1920, og 1200x630.",
            ),
          width: z.number().int().min(16).max(4096).optional().describe("Overrides the size preset."),
          height: z.number().int().min(16).max(4096).optional().describe("Overrides the size preset."),
          saveToDrive: z
            .boolean()
            .default(false)
            .describe(
              "Upload the finished render straight into Google Drive and return a Drive link. The upload is server-to-server, so use this to deliver work to a client rather than fetching the image and re-uploading it yourself.",
            ),
          driveFolder: z
            .string()
            .max(300)
            .optional()
            .describe(
              "Destination folder as a slash-separated path, e.g. '412 Birchwood Lane/2026-07'. Any segment that does not exist is created, so there is nothing to set up in advance. Reuses folders this server created previously.",
            ),
          driveFolderId: z
            .string()
            .optional()
            .describe(
              "Exact destination folder ID. Use this only to deliver into a folder someone else created — otherwise prefer driveFolder and let the server manage the tree.",
            ),
          fileName: z
            .string()
            .max(200)
            .optional()
            .describe("File name for the Drive upload, e.g. '412-birchwood-01-listing.png'. Defaults to a timestamped name."),
          output: z
            .enum(["url", "inline", "both"])
            .default("url")
            .describe(
              "How to return the render. 'url' (default) returns a fetchable image URL and keeps the bytes server-side — use this for anything programmatic, and pass the URL to other tools rather than the image itself. 'inline' returns the PNG as base64 image content so a human can see it in the conversation; it costs enormous context, so only use it when someone actually needs to look at the result. 'both' does each.",
            ),
        }),
      },
      async ({ markup, size, width, height, output, saveToDrive, driveFolder, driveFolderId, fileName }) => {
        const { errors, warnings } = lintMarkup(markup);
        if (errors.length === 0) errors.push(...(await checkImageSources(markup)));

        if (errors.length > 0) {
          return {
            content: [
              {
                type: "text",
                text: [
                  "Markup rejected before rendering. Fix these and call again:",
                  ...errors.map((e) => `- ${e}`),
                  "",
                  "--- Authoring guide ---",
                  GUIDE,
                ].join("\n"),
              },
            ],
            isError: true,
          };
        }

        try {
          const png = await renderToPng({ markup, size, width, height });
          const dimensions = width && height ? { width, height } : SIZES[size];

          const notes = [
            `Rendered ${dimensions.width}x${dimensions.height} PNG, ${(png.byteLength / 1024).toFixed(1)} KB.`,
          ];

          // Default path: hand back a reference, not the bytes.
          if (output !== "inline") {
            if (blobConfigured()) {
              const url = await uploadToBlob(png);
              notes.push(`URL: ${url}`, "Stored in Vercel Blob. Permanent, CDN-backed, safe to pass to other tools.");
            } else {
              const { url, tooLong } = selfDescribingUrl({ markup, size, width, height });
              notes.push(`URL: ${url}`);
              notes.push(
                tooLong
                  ? "This URL encodes the markup and is long enough that some clients may reject it. Set BLOB_READ_WRITE_TOKEN on the deployment to get short permanent URLs instead."
                  : "This URL re-renders the image on fetch, so it needs no storage. Set BLOB_READ_WRITE_TOKEN on the deployment for short permanent blob URLs instead.",
              );
            }
          }

          if (saveToDrive) {
            if (!driveMode()) {
              notes.push(`Drive upload skipped. ${DRIVE_SETUP_HINT}`);
            } else {
              try {
                const folderId =
                  driveFolderId ?? (driveFolder ? await ensureFolderPath(driveFolder) : undefined);

                const uploaded = await uploadToDrive({
                  bytes: png,
                  name: fileName ?? `render-${new Date().toISOString().replace(/[:.]/g, "-")}.png`,
                  folderId,
                });
                notes.push(
                  `Saved to Google Drive as "${uploaded.name}"${driveFolder ? ` in ${driveFolder}` : ""}.`,
                  `Drive link: ${uploaded.webViewLink}`,
                  `Drive file ID: ${uploaded.fileId} — pass this to delete_drive_file to remove it.`,
                );
              } catch (error) {
                notes.push(
                  `Drive upload failed (the render itself succeeded): ${error instanceof Error ? error.message : String(error)}`,
                );
              }
            }
          }

          notes.push(...warnings.map((w) => `Warning: ${w}`));

          const content: Array<
            | { type: "text"; text: string }
            | { type: "image"; data: string; mimeType: string }
          > = [];

          if (output !== "url") {
            content.push({
              type: "image",
              data: Buffer.from(png).toString("base64"),
              mimeType: "image/png",
            });
          }
          content.push({ type: "text", text: notes.join("\n") });

          return { content };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text",
                text: [
                  `Render failed: ${explainRenderError(message)}`,
                  "",
                  "--- Authoring guide ---",
                  GUIDE,
                ].join("\n"),
              },
            ],
            isError: true,
          };
        }
      },
    );

    server.registerTool(
      "render_listing_carousel",
      {
        title: "Render Listing Carousel",
        description: [
          "Builds a complete real-estate carousel from listing data — no markup required.",
          "",
          "Read render://listing-guide before the first use — it covers where photos come from,",
          "how to write captions, and a full worked example. Read render://listing-presets to see",
          "exact preset colours and fonts.",
          "",
          "Prefer this over render_image for property posts. It produces the whole sequence in",
          "one call and enforces the things that are easy to get wrong by hand:",
          "- Slide 1 is the listing card: photo, price, address, beds/baths/sqft.",
          "- Middle slides are photos with captions.",
          "- The last slide always asks for the booking, with the contact details visible.",
          "- Captions stay clear of the bottom of the frame, which Instagram's UI covers.",
          "- Every slide carries the brokerage, so a screenshot stays attributed.",
          "- One preset drives palette and typography across the set, so it reads as one post.",
          "",
          "Presets: 'gallery' (bone and black, serif — high-end), 'estate' (charcoal and gold,",
          "serif — luxury), 'midnight' (navy and amber, sans — mid-market).",
          "",
          "Photos may be public image URLs or file IDs returned by /api/upload. Formats that",
          "Satori cannot decode, such as WebP, are converted automatically.",
          "",
          "Returns one URL per slide, in order. Set saveToDrive to deliver them to a folder — and",
          "if the photos came from a folder the user already has, pass its ID as driveFolderId",
          "rather than driveFolder. This server can only see folders it created itself, so naming",
          "an existing folder by path creates a duplicate instead of saving into it. delete_drive_file",
          "removes a slide by ID for the render-look-discard-rerender loop.",
        ].join("\n"),
        annotations: { readOnlyHint: false, openWorldHint: false },
        inputSchema: z.object({
          preset: z
            .enum(["gallery", "estate", "midnight"])
            .default("gallery")
            .describe("Visual system for the whole carousel."),
          listing: z
            .object({
              badge: z.string().max(40).default("JUST LISTED"),
              price: z.string().max(40).describe("Formatted, e.g. '$8,495,000'."),
              street: z.string().max(120),
              cityState: z.string().max(120).describe("e.g. 'Beverly Hills, CA 90210'."),
              beds: z.string().max(10),
              baths: z.string().max(10),
              sqft: z.string().max(15).describe("Formatted, e.g. '5,207'."),
            })
            .describe("Listing facts shown on the card."),
          brand: z
            .object({
              brokerage: z.string().max(80).describe("Shown on every slide."),
              handle: z.string().max(60).optional().describe("e.g. '@bakarirealty'."),
              contact: z
                .string()
                .max(80)
                .optional()
                .describe("The ask on the final slide, e.g. 'DM to schedule' or a phone number."),
            })
            .describe("Who this post belongs to and how to reach them."),
          photos: z
            .array(
              z.object({
                url: z.string().min(1).describe("Image URL, or a file ID from /api/upload."),
                caption: z
                  .string()
                  .max(120)
                  .optional()
                  .describe("Short line describing what is in the shot. Skipped on the first photo, which becomes the card."),
              }),
            )
            .min(1)
            .max(20)
            .describe(
              "Photos in order. The first becomes the listing card; the last also backs the closing slide. Instagram allows 20 slides.",
            ),
          closingHeadline: z
            .string()
            .max(120)
            .default("Book a private showing")
            .describe("Headline on the final slide."),
          saveToDrive: z.boolean().default(false),
          driveFolder: z
            .string()
            .max(300)
            .optional()
            .describe(
              "Folder path, created on demand, e.g. '1166 San Ysidro Dr/2026-07'. Only use this when the destination does not exist yet — this server cannot see folders it did not create, so naming an existing one here produces a duplicate alongside it.",
            ),
          driveFolderId: z
            .string()
            .optional()
            .describe(
              "ID of an existing folder to deliver into — the correct choice when the photos came from a folder the user already had. Take the ID from whatever listed that folder. Wins over driveFolder.",
            ),
        }),
      },
      async ({ preset, listing, brand, photos, closingHeadline, saveToDrive, driveFolder, driveFolderId }) => {
        const slides: Array<{ name: string; markup: string }> = [
          {
            name: "01-listing-card",
            markup: listingCard({ photo: photos[0].url, listing, brand, preset }),
          },
        ];

        const middle = photos.slice(1);
        const total = middle.length + 2;
        middle.forEach((photo, i) => {
          slides.push({
            name: `${String(i + 2).padStart(2, "0")}-photo`,
            markup: tourSlide({
              photo: photo.url,
              caption: photo.caption,
              index: i + 2,
              total,
              brand,
              preset,
            }),
          });
        });

        slides.push({
          name: `${String(total).padStart(2, "0")}-closing`,
          markup: closingSlide({
            photo: photos[photos.length - 1].url,
            headline: closingHeadline,
            listing,
            brand,
            preset,
          }),
        });

        const lines: string[] = [];
        let failures = 0;

        for (const slide of slides) {
          try {
            const png = await renderToPng({ markup: slide.markup, size: "ig-portrait" });

            let reference: string;
            if (blobConfigured()) {
              reference = await uploadToBlob(png);
            } else {
              reference = selfDescribingUrl({ markup: slide.markup, size: "ig-portrait" }).url;
            }

            let delivered = "";
            if (saveToDrive && driveMode()) {
              const folderId =
                driveFolderId ?? (driveFolder ? await ensureFolderPath(driveFolder) : undefined);
              const uploaded = await uploadToDrive({
                bytes: png,
                name: `${slide.name}.png`,
                folderId,
              });
              delivered = `  Drive: ${uploaded.webViewLink}`;
            } else if (saveToDrive) {
              delivered = "  Drive upload skipped (not configured on this deployment)";
            }

            lines.push(`${slide.name}: ${reference}${delivered}`);
          } catch (error) {
            failures += 1;
            lines.push(
              `${slide.name}: FAILED — ${explainRenderError(error instanceof Error ? error.message : String(error))}`,
            );
          }
        }

        return {
          content: [
            {
              type: "text",
              text: [
                `Rendered ${slides.length - failures}/${slides.length} slides at 1080x1350, preset "${preset}".`,
                ...lines,
              ].join("\n"),
            },
          ],
          isError: failures > 0,
        };
      },
    );

    server.registerTool(
      "delete_drive_file",
      {
        title: "Delete Drive File",
        description: [
          "Deletes a file this server previously uploaded to Google Drive, by its Drive file ID.",
          "",
          "Intended for the review loop: render a slide into the client's Drive, and if it is not",
          "right, delete it and render another. The server holds drive.file scope, so it can only",
          "touch files it created — it cannot delete anything else in the account.",
          "",
          "Deleting is permanent, so confirm with the person before removing anything they may want.",
        ].join("\n"),
        annotations: {
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
        inputSchema: z.object({
          fileId: z
            .string()
            .min(1)
            .describe("Drive file ID, as returned by render_image when saveToDrive was used."),
        }),
      },
      async ({ fileId }) => {
        if (!driveMode()) {
          return { content: [{ type: "text", text: DRIVE_SETUP_HINT }], isError: true };
        }
        try {
          await deleteFromDrive(fileId);
          return { content: [{ type: "text", text: `Deleted Drive file ${fileId}.` }] };
        } catch (error) {
          return {
            content: [
              { type: "text", text: `Could not delete ${fileId}: ${error instanceof Error ? error.message : String(error)}` },
            ],
            isError: true,
          };
        }
      },
    );

    server.registerResource(
      "listing-guide",
      "render://listing-guide",
      {
        title: "Real Estate Carousel Guide",
        description:
          "How to use render_listing_carousel end to end: where photos come from, how the Drive folder arguments work, how to write captions, and a full worked example. Read this before building a property carousel — it is a different, simpler path than render_image.",
        mimeType: "text/markdown",
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: `# Building a real-estate carousel

For property posts, use \`render_listing_carousel\`, not \`render_image\`. It takes
listing data and photos and returns a correct, complete carousel — no markup, and
the layout rules (safe zone, brokerage attribution, a closing slide with a real
call to action) are enforced by the server rather than left to you.

## Where photos come from

The server renders; it cannot read your files, your Drive, or the user's. Every
photo needs a URL it can fetch:

- **A Drive folder the user already has.** Read the folder to list the images,
  make each one link-viewable, and pass its share URL. The folder's *name* is
  often the address — split it on the first comma into \`street\` and
  \`cityState\` rather than asking the user to retype it.
- **\`POST /api/upload\`** (or the \`/upload\` page) if the user is handing you a
  file directly. It stores privately and hands back a URL — nothing needs to be
  shared.
- WebP, AVIF, and oversized photos are converted and resized automatically; do
  not pre-process them yourself.

## Writing captions

Caption every photo after the first honestly — describe what is actually in the
frame ("Screened porch over the water"), not a generic real-estate line. If you
have not looked at the photo, say so rather than inventing detail; a caption
that describes something not in the shot is the one mistake a tool cannot catch
for you.

## Choosing a preset

Read \`render://listing-presets\` for the exact values. In short:

- **gallery** — bone and near-black, serif headlines. Default choice, reads
  upmarket without shouting.
- **estate** — charcoal and soft gold, serif. For the top of the market, where
  the price is doing the talking.
- **midnight** — navy and amber, sans-serif. Mid-market, more energetic.

## Delivering to Drive

Pass \`saveToDrive: true\` plus **one** of:

- **\`driveFolderId\`** — use this whenever the user already has a folder for
  this listing (e.g. the one the photos came from). This is almost always the
  right choice once a folder exists.
- **\`driveFolder\`** — a slash-separated path, created if missing. Use this only
  when nothing exists yet.

Getting this backwards is the one mistake worth flagging explicitly: this
server can only see folders *it* created, so passing \`driveFolder\` with the
name of a folder the user already made does not save into it — it silently
creates a second, identical-looking folder alongside theirs. If a folder ID is
already in hand from reading Drive, use it.

\`delete_drive_file\` removes a slide by the file ID a previous call returned, for
the review loop: render, look, delete what is wrong, render again.

## Worked example

\`\`\`json
{
  "preset": "gallery",
  "listing": {
    "badge": "JUST LISTED",
    "price": "$2,750,000",
    "street": "1428 Cypress Hollow Rd",
    "cityState": "Ojai, CA 93023",
    "beds": "4",
    "baths": "3",
    "sqft": "3,180"
  },
  "brand": {
    "brokerage": "Bakari Realty Group",
    "handle": "@bakarirealty",
    "contact": "DM to book a showing"
  },
  "photos": [
    { "url": "https://drive.google.com/file/d/.../view" },
    { "url": "https://drive.google.com/file/d/.../view", "caption": "Glass wall opens the living room to the hills" },
    { "url": "https://drive.google.com/file/d/.../view", "caption": "Walnut island seats five" },
    { "url": "https://drive.google.com/file/d/.../view", "caption": "Evenings by the pool" }
  ],
  "closingHeadline": "Book a private showing",
  "saveToDrive": true,
  "driveFolderId": "<id of the folder the photos came from>"
}
\`\`\`

The first photo becomes the listing card. The last photo also backs the closing
slide. Everything renders at 1080x1350 (Instagram's best carousel ratio), with
meaningful content kept above the bottom ${SAFE_BOTTOM}px, which Instagram's UI
covers.
`,
          },
        ],
      }),
    );

    server.registerResource(
      "listing-presets",
      "render://listing-presets",
      {
        title: "Listing Carousel Presets",
        description:
          "The exact palette and typography values behind each render_listing_carousel preset (gallery, estate, midnight), as JSON. Read this to describe a preset accurately, or to see what a custom brand palette should be styled to match.",
        mimeType: "application/json",
      },
      async (uri) => ({
        contents: [
          { uri: uri.href, mimeType: "application/json", text: JSON.stringify(PRESETS, null, 2) },
        ],
      }),
    );

    server.registerResource(
      "render-guide",
      "render://guide",
      {
        title: "Image Authoring Guide",
        description:
          "Everything needed to write markup for render_image: the hard rules, the supported CSS surface, available fonts, size presets, and Instagram layout constraints. Read this before composing an image.",
        mimeType: "text/markdown",
      },
      async (uri) => ({
        contents: [{ uri: uri.href, mimeType: "text/markdown", text: GUIDE }],
      }),
    );

    server.registerResource(
      "render-examples",
      "render://examples",
      {
        title: "Image Markup Examples",
        description:
          "Five complete, verified slide layouts for render_image — hook slide, numbered list, quote, photo background with scrim, and a two column stat slide. Copy the structure and swap the content.",
        mimeType: "text/markdown",
      },
      async (uri) => ({
        contents: [{ uri: uri.href, mimeType: "text/markdown", text: EXAMPLES }],
      }),
    );

    server.registerResource(
      "render-sizes",
      "render://sizes",
      {
        title: "Size Presets",
        description: "The render_image size presets and their pixel dimensions, as JSON.",
        mimeType: "application/json",
      },
      async (uri) => ({
        contents: [
          { uri: uri.href, mimeType: "application/json", text: JSON.stringify(SIZES, null, 2) },
        ],
      }),
    );

    server.registerPrompt(
      "carousel",
      {
        title: "Build an Instagram Carousel",
        description:
          "Plans and renders a multi-slide Instagram carousel on a given topic, using render_image for each slide.",
        argsSchema: z.object({
          topic: z.string().min(1).describe("What the carousel is about."),
          slides: z
            .string()
            .default("5")
            .describe("How many slides to produce, as a number. Instagram allows up to 20."),
          brand: z
            .string()
            .default("")
            .describe("Optional brand direction: colours, handle, tone."),
        }),
      },
      ({ topic, slides, brand }) => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                `Build a ${slides}-slide Instagram carousel about: ${topic}`,
                ...(brand ? [`Brand direction: ${brand}`] : []),
                "",
                "Work in this order:",
                "1. Read the `render://guide` and `render://examples` resources first.",
                "2. Write the copy for every slide before rendering anything. Slide 1 is the hook —",
                "   it is the only slide most people see, so it carries the whole post. The last",
                "   slide should ask for something specific.",
                "3. Commit to one visual system: a background treatment, one accent colour, and a",
                "   type scale. Reuse them on every slide so the set reads as one post.",
                "4. Render each slide with render_image at size `ig-portrait`. Every slide must use",
                "   the same size or Instagram will crop them inconsistently. Collect the returned",
                "   URLs — do not request the image bytes, which would exhaust your context.",
                "5. List the slide URLs in order, and say what the hook is doing.",
                "",
                "Keep meaningful content out of the bottom 15% of each slide — the Instagram UI",
                "covers it. Only Inter 400 and 700 are available.",
              ].join("\n"),
            },
          },
        ],
      }),
    );

    server.registerPrompt(
      "listing_carousel",
      {
        title: "Build a Real Estate Carousel",
        description:
          "Builds an Instagram carousel for a property listing using render_listing_carousel, pulling photos from a named Drive folder.",
        argsSchema: z.object({
          driveFolderName: z
            .string()
            .min(1)
            .describe("Name of the Drive folder holding the listing photos — often the address itself."),
          price: z.string().min(1).describe("e.g. '$2,750,000'."),
          beds: z.string().min(1),
          baths: z.string().min(1),
          sqft: z.string().min(1).describe("e.g. '3,180'."),
          brokerage: z.string().min(1),
          handle: z.string().default("").describe("e.g. '@bakarirealty'."),
          contact: z
            .string()
            .default("DM to book a showing")
            .describe("The ask on the closing slide."),
          preset: z
            .string()
            .default("gallery")
            .describe("gallery, estate, or midnight — see render://listing-presets."),
        }),
      },
      ({ driveFolderName, price, beds, baths, sqft, brokerage, handle, contact, preset }) => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                "Build an Instagram carousel for a property listing. Work in this order:",
                "",
                "1. Read render://listing-guide first.",
                `2. Find the Drive folder named: ${driveFolderName}`,
                "   Note its folder ID — you will need it in step 5.",
                "3. The folder name is usually the address. Split it on the first comma:",
                "   street = everything before, cityState = everything after.",
                "4. List the images in that folder, in order. Make each link-viewable if it is not",
                "   already, and use its share URL as the photo URL.",
                "5. Call render_listing_carousel:",
                `     preset:      ${preset}`,
                "     listing:     street and cityState from step 3, plus",
                `                  price ${price}, beds ${beds}, baths ${baths}, sqft ${sqft}`,
                "     brand:       brokerage " + JSON.stringify(brokerage) +
                  (handle ? `, handle ${JSON.stringify(handle)}` : "") +
                  `, contact ${JSON.stringify(contact)}`,
                "     photos:      the folder's images in order — the first becomes the listing",
                "                  card. Write a short, honest caption for each of the rest",
                "                  describing what is actually in that shot.",
                "     saveToDrive: true",
                "     driveFolderId: the ID from step 2 — not driveFolder, which would create a",
                "                    second folder instead of using the one the photos came from.",
                "6. List the returned slide URLs in order.",
              ].join("\n"),
            },
          },
        ],
      }),
    );

    server.registerResource(
      "server-info",
      "hello://info",
      {
        title: "Server Info",
        description: "Static description of this test MCP server.",
        mimeType: "text/plain",
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            text: [
              "hello-world-mcp",
              "A minimal Model Context Protocol server hosted on Vercel.",
              "Tools: hello_world, echo, server_time, render_image.",
            ].join("\n"),
          },
        ],
      }),
    );

    server.registerPrompt(
      "greet",
      {
        title: "Greet Someone",
        description: "Produces a short, warm greeting for the given name.",
        argsSchema: z.object({
          name: z.string().min(1).describe("Who to greet."),
        }),
      },
      ({ name }) => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Write a short, warm one-sentence greeting for ${name}.`,
            },
          },
        ],
      }),
    );
  },
  {
    serverInfo: {
      name: "hello-world-mcp",
      version: "0.1.0",
    },
  },
  {
    verboseLogs: process.env.VERCEL_ENV !== "production",
  },
);

export { handler as GET, handler as POST };

export const runtime = "nodejs";

export const maxDuration = 60;
