import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { renderToPng, SIZES } from "../render/render";
import { EXAMPLES, GUIDE, RULES_SUMMARY } from "../render/docs";
import { checkImageSources, explainRenderError, lintMarkup } from "../render/lint";
import { blobConfigured, selfDescribingUrl, uploadToBlob } from "../render/store";
import {
  DRIVE_SETUP_HINT,
  deleteFromDrive,
  driveMode,
  ensureFolderPath,
  listFolderImages,
  parseDriveFolderId,
  uploadToDrive,
} from "../render/drive";
import { closingSlide, listingCard, PRESETS, SAFE_BOTTOM, tourSlide } from "../render/listing";
import { resolveRenderContext, siteUrl } from "../../../lib/core/context";
import { refreshJob, startVideoJob } from "../../../lib/jobs/run";
import { jobStore } from "../../../lib/jobs/store";
import type { VideoId } from "../../../lib/renderers/remotion/render";
import {
  listingStore,
  listingStoreKind,
  slugForListing,
  type ListingRecord,
} from "../../../lib/store/listings";

/**
 * Without a Blob token the store is a per-process Map. That is fine locally and
 * broken on Vercel, where the next request lands on a different lambda and the
 * page 404s — so say so at the point the listing is created rather than letting
 * someone discover it from a dead link.
 */
function storageWarning(): string {
  return listingStoreKind() === "file"
    ? "\nNote: no Blob token is configured, so this listing is stored in a local .listings directory. That is fine for development and will not exist on a deployment."
    : "";
}

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

    server.registerTool(
      "create_listing",
      {
        title: "Create Listing Website",
        description: [
          "Saves a property record on this server and returns the URL that serves it.",
          "",
          "Nothing is sent anywhere. No email, no post, no message, no third party — the record",
          "is written to this server's own storage and rendered at /p/<address-slug> when",
          "someone visits it. Re-running with the same street address updates that same record",
          "rather than creating another, and delete_listing removes it. Nothing here is",
          "irreversible.",
          "",
          "Hand over the property data, the photo URLs and the agent's branding, and the page",
          "is built for you. The theme supplies every colour and typeface, so the page looks",
          "designed without anyone making design decisions.",
          "",
          "Values are RAW, not pre-formatted. Send priceCents: 849500000, not \"$8,495,000\".",
          "The server does the formatting so the website, the carousel and everything added",
          "later show the same number the same way.",
          "",
          "Photos: pass public https:// URLs, or bare Google Drive file IDs for photos uploaded",
          "through this server. The first photo becomes the hero unless one is marked hero.",
          "Order is the order you pass them in.",
          "",
          "Correcting a typo is just another call with the same street address. Pass the slug",
          "returned earlier to be certain which listing you are editing.",
        ].join("\n"),
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        inputSchema: z.object({
          slug: z
            .string()
            .max(80)
            .optional()
            .describe("Update this exact listing. Omit when creating; derived from the street."),
          theme: z
            .enum(["minimal", "luxury", "modern"])
            .default("minimal")
            .describe(
              "minimal = warm paper and editorial serif. luxury = near-black with brass. modern = deep navy with gold.",
            ),
          listing: z.object({
            street: z.string().min(1).max(120).describe('e.g. "1166 San Ysidro Dr"'),
            city: z.string().min(1).max(80),
            state: z.string().min(1).max(40),
            zip: z.string().max(20).default(""),
            priceCents: z.number().int().nonnegative().describe("849500000 for $8,495,000"),
            beds: z.number().int().nonnegative(),
            bathsFull: z.number().int().nonnegative(),
            bathsHalf: z.number().int().nonnegative().default(0),
            sqft: z.number().int().positive().nullable().default(null),
            lotSqft: z.number().int().positive().nullable().default(null),
            yearBuilt: z.number().int().nullable().default(null),
            description: z
              .string()
              .max(4000)
              .default("")
              .describe("A paragraph or two. Describe the property, never the neighbours."),
            features: z
              .array(z.string().max(80))
              .max(30)
              .default([])
              .describe('Short phrases: "Chef\'s kitchen", "Guest house", "Pool".'),
            mlsId: z.string().max(60).nullable().default(null),
          }),
          driveFolder: z
            .string()
            .max(500)
            .optional()
            .describe(
              "Drive folder URL, share link, or ID holding the listing photos. Every image in it is used, in filename order, and the first becomes the hero. Use this instead of photos[] — it is the one-click path.",
            ),
          photos: z
            .array(
              z.object({
                url: z.string().min(1).describe("Public https:// URL or a Drive file ID."),
                alt: z.string().max(200).optional(),
                role: z.enum(["hero", "gallery"]).default("gallery"),
              }),
            )
            .max(40)
            .optional()
            .describe("Explicit photo list. Omit when driveFolder is given."),
          brand: z.object({
            agentName: z.string().min(1).max(120),
            agentTitle: z.string().max(120).nullable().default(null),
            phone: z.string().max(40).nullable().default(null),
            email: z.string().max(200).nullable().default(null),
            brokerageName: z.string().min(1).max(160),
            brokerageLicense: z.string().max(80).nullable().default(null),
            headshotUrl: z.string().max(2000).nullable().default(null),
            logoUrl: z.string().max(2000).nullable().default(null),
            instagram: z.string().max(120).nullable().default(null),
            facebook: z.string().max(200).nullable().default(null),
            linkedin: z.string().max(200).nullable().default(null),
            website: z.string().max(200).nullable().default(null),
            accentColor: z
              .string()
              .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
              .nullable()
              .default(null)
              .describe("Optional brand colour. Text on it stays readable automatically."),
            ctaText: z.string().max(80).default("Book a private showing"),
            legalDisclaimer: z.string().max(400).nullable().default(null),
          }),
        }),
      },
      async ({ slug, theme, listing, driveFolder, photos: explicitPhotos, brand }) => {
        try {
          // A folder is the one-click path; an explicit list is the escape hatch.
          let photos = explicitPhotos ?? [];
          if (driveFolder) {
            if (!driveMode()) {
              return { content: [{ type: "text", text: DRIVE_SETUP_HINT }], isError: true };
            }
            const folderId = parseDriveFolderId(driveFolder);
            if (!folderId) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Could not find a folder ID in "${driveFolder}". Paste the folder's Drive URL or its ID.`,
                  },
                ],
                isError: true,
              };
            }
            const found = await listFolderImages(folderId);
            photos = found.map((photo, index) => ({
              url: photo.fileId,
              alt: undefined,
              role: index === 0 ? ("hero" as const) : ("gallery" as const),
            }));
          }

          if (photos.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: driveFolder
                    ? "That Drive folder has no images in it. Check it is the folder holding the photos rather than its parent."
                    : "No photos given. Pass driveFolder to pull them from a Drive folder, or photos[] to list them explicitly.",
                },
              ],
              isError: true,
            };
          }

          const store = listingStore();
          const resolvedSlug = await slugForListing(store, listing, slug);
          const existing = await store.get(resolvedSlug);
          const now = new Date().toISOString();

          // A photo explicitly marked hero wins; otherwise the first one is it.
          const heroIndex = Math.max(
            0,
            photos.findIndex((p) => p.role === "hero"),
          );

          const record: ListingRecord = {
            listing: {
              id: existing?.listing.id ?? crypto.randomUUID(),
              accountId: existing?.listing.accountId ?? "default",
              slug: resolvedSlug,
              status: "published",
              street: listing.street,
              city: listing.city,
              state: listing.state,
              zip: listing.zip,
              priceCents: listing.priceCents,
              beds: listing.beds,
              bathsFull: listing.bathsFull,
              bathsHalf: listing.bathsHalf,
              sqft: listing.sqft,
              lotSqft: listing.lotSqft,
              yearBuilt: listing.yearBuilt,
              description: listing.description,
              features: listing.features,
              mlsId: listing.mlsId,
              publishedAt: existing?.listing.publishedAt ?? now,
            },
            photos: photos.map((photo, index) => ({
              id: `${resolvedSlug}-${index}`,
              url: photo.url,
              sortOrder: index,
              role: index === heroIndex ? "hero" : "gallery",
              width: null,
              height: null,
              alt: photo.alt ?? null,
            })),
            brand: {
              accountId: "default",
              agentUserId: null,
              logoUrl: brand.logoUrl,
              headshotUrl: brand.headshotUrl,
              accentColor: brand.accentColor,
              headingFont: null,
              bodyFont: null,
              agentName: brand.agentName,
              agentTitle: brand.agentTitle,
              phone: brand.phone,
              email: brand.email,
              brokerageName: brand.brokerageName,
              brokerageLicense: brand.brokerageLicense,
              instagram: brand.instagram,
              facebook: brand.facebook,
              linkedin: brand.linkedin,
              website: brand.website,
              ctaText: brand.ctaText,
              legalDisclaimer: brand.legalDisclaimer,
              defaultTheme: theme,
            },
            themeId: theme,
            updatedAt: now,
          };

          await store.save(record);

          return {
            content: [
              {
                type: "text",
                text: [
                  siteUrl(resolvedSlug),
                  "",
                  `${existing ? "Updated" : "Published"} ${listing.street} with ${photos.length} photo${photos.length === 1 ? "" : "s"} on the ${theme} theme.`,
                  `Slug: ${resolvedSlug} — pass this back to edit or delete this listing.`,
                  storageWarning(),
                ]
                  .filter(Boolean)
                  .join("\n"),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Could not publish the listing: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      },
    );

    server.registerTool(
      "list_drive_photos",
      {
        title: "List Photos In A Drive Folder",
        description: [
          "Every image in a Google Drive folder, in filename order, ready to hand to",
          "create_listing.",
          "",
          "Paste whatever the agent copied — the folder URL from Drive's address bar, a share",
          "link, or the bare folder ID. All three work.",
          "",
          "Listing photos are conventionally named for their running order (01-exterior,",
          "02-living), so filename order is the running order. Upload order is not.",
        ].join("\n"),
        annotations: { readOnlyHint: true, openWorldHint: false },
        inputSchema: z.object({
          folder: z
            .string()
            .min(1)
            .max(500)
            .describe("Drive folder URL, share link, or folder ID."),
        }),
      },
      async ({ folder }) => {
        if (!driveMode()) {
          return { content: [{ type: "text", text: DRIVE_SETUP_HINT }], isError: true };
        }
        const folderId = parseDriveFolderId(folder);
        if (!folderId) {
          return {
            content: [
              {
                type: "text",
                text: `Could not find a folder ID in "${folder}". Paste the folder's Drive URL (it contains /folders/<id>) or the ID itself.`,
              },
            ],
            isError: true,
          };
        }

        try {
          const photos = await listFolderImages(folderId);
          if (photos.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `Folder ${folderId} has no images in it. Check it is the folder holding the photos rather than its parent.`,
                },
              ],
              isError: true,
            };
          }
          return {
            content: [
              {
                type: "text",
                text: [
                  `${photos.length} photo${photos.length === 1 ? "" : "s"} in folder ${folderId}, in order:`,
                  "",
                  ...photos.map((p, i) => `${i + 1}. ${p.name} — ${p.fileId}`),
                  "",
                  "Pass these file IDs to create_listing as photos[].url, keeping this order.",
                ].join("\n"),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: error instanceof Error ? error.message : String(error),
              },
            ],
            isError: true,
          };
        }
      },
    );

    server.registerTool(
      "delete_listing",
      {
        title: "Delete Listing Website",
        description: [
          "Takes a published property page offline. Its URL will 404 afterwards.",
          "",
          "Deleting is permanent and the page may already be linked from social posts or a",
          "printed flyer, so confirm with the person before removing anything.",
        ].join("\n"),
        annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
        inputSchema: z.object({
          slug: z.string().min(1).max(80).describe("As returned by create_listing."),
        }),
      },
      async ({ slug }) => {
        try {
          await listingStore().remove(slug);
          return { content: [{ type: "text", text: `Deleted listing ${slug}.` }] };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Could not delete ${slug}: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      },
    );

    server.registerTool(
      "list_listings",
      {
        title: "List Published Listings",
        description:
          "Every property currently published by this server, newest first, with the slug needed to edit or delete each one.",
        annotations: { readOnlyHint: true, openWorldHint: false },
        inputSchema: z.object({}),
      },
      async () => {
        const summaries = await listingStore().list();
        if (summaries.length === 0) {
          return {
            content: [
              { type: "text", text: "No listings published yet. Use create_listing to add one." },
            ],
          };
        }
        return {
          content: [
            {
              type: "text",
              text: summaries
                .map((s) => `${s.slug} — ${s.street}, ${s.cityState} — ${siteUrl(s.slug)}`)
                .join("\n"),
            },
          ],
        };
      },
    );

    /**
     * `search` and `fetch` exist for ChatGPT specifically.
     *
     * A ChatGPT connector without Developer Mode is held to the deep-research
     * contract, which recognises exactly two tool names — these two. A server
     * offering neither has no callable surface in a default chat at all, which
     * is how a working server ends up reported as "I can see the schema but
     * cannot invoke it". Every other client ignores them and uses the richer
     * tools below.
     *
     * Both return the payload twice: once as `structuredContent` and once
     * JSON-encoded in `content`. OpenAI requires the duplication and treats a
     * response carrying only one form as no match at all.
     */
    server.registerTool(
      "search",
      {
        title: "Search Listings",
        description: [
          "Finds published listings by address, city, or slug, and returns their ids and URLs.",
          "",
          "Pass the id of any result to `fetch` to read the full property details.",
          "An empty query returns everything currently published.",
        ].join("\n"),
        annotations: { readOnlyHint: true, openWorldHint: false },
        inputSchema: z.object({
          query: z
            .string()
            .max(200)
            .default("")
            .describe("Words from the address, city, or slug. Empty matches everything."),
        }),
        outputSchema: z.object({
          results: z.array(
            z.object({ id: z.string(), title: z.string(), url: z.string() }),
          ),
        }),
      },
      async ({ query }) => {
        const summaries = await listingStore().list();

        // Every word has to appear somewhere in the listing's text, so "sunset
        // beverly" narrows rather than widens. Substring rather than whole-word
        // because "sunset" should find "9541 Sunset Blvd".
        const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
        const results = summaries
          .filter((s) => {
            const haystack = `${s.slug} ${s.street} ${s.cityState}`.toLowerCase();
            return terms.every((term) => haystack.includes(term));
          })
          .map((s) => ({
            id: s.slug,
            title: `${s.street}, ${s.cityState}`,
            url: siteUrl(s.slug),
          }));

        const output = { results };
        return {
          content: [{ type: "text", text: JSON.stringify(output) }],
          structuredContent: output,
        };
      },
    );

    server.registerTool(
      "fetch",
      {
        title: "Fetch A Listing",
        description: [
          "Full details of one published listing: price, stats, description, features and agent.",
          "",
          "Takes an id from `search` — the listing's slug. Read-only.",
        ].join("\n"),
        annotations: { readOnlyHint: true, openWorldHint: false },
        inputSchema: z.object({
          id: z.string().min(1).max(80).describe("Listing slug, as returned by search."),
        }),
        outputSchema: z.object({
          id: z.string(),
          title: z.string(),
          text: z.string(),
          url: z.string(),
        }),
      },
      async ({ id }) => {
        const context = await resolveRenderContext(id);
        if (!context) {
          return {
            content: [
              { type: "text", text: `No listing with id "${id}". Use search to find one.` },
            ],
            isError: true,
          };
        }

        const { listing, brand, formatted } = context;

        // Built from `formatted` rather than the raw record, so this cannot
        // disagree with the property page about a price.
        const text = [
          `${formatted.fullAddress}`,
          `${formatted.price}`,
          formatted.stats.map((s) => `${s.value} ${s.label}`).join(" · "),
          listing.yearBuilt ? `Built ${listing.yearBuilt}` : "",
          "",
          listing.description,
          listing.features.length > 0 ? `\nFeatures: ${listing.features.join(", ")}` : "",
          "",
          `Listed by ${brand.agentName}${brand.agentTitle ? `, ${brand.agentTitle}` : ""} — ${brand.brokerageName}`,
          // Attribution carries the licence and disclaimer. With neither set it
          // collapses to the brokerage name, which the line above already said.
          formatted.attribution === brand.brokerageName ? "" : formatted.attribution,
        ]
          .filter((line) => line !== "")
          .join("\n")
          .trim();

        const output = { id, title: formatted.fullAddress, text, url: context.urls.site };
        return {
          content: [{ type: "text", text: JSON.stringify(output) }],
          structuredContent: output,
        };
      },
    );

    server.registerTool(
      "render_listing_video",
      {
        title: "Render Listing Video",
        description: [
          "Renders a video file for a listing already stored here, and returns a job id.",
          "",
          "Nothing is sent anywhere. The video is written to this server's own storage and the",
          "job reports a URL to download it — it is not posted to Instagram, TikTok, or any",
          "other account, and no message goes out. Publishing it is a separate human decision.",
          "",
          "Video is slow — around two minutes for a 19-second clip — so this does NOT wait.",
          "Poll get_render_job with the returned id until it reports done, then use the URL.",
          "",
          "The video is built from the stored listing: same photos, same price, same branding",
          "as the property page and the carousel. Length follows the photo count, roughly 19",
          "seconds for five photos.",
          "",
          "Orientations: 9x16 is vertical for Reels, TikTok, Shorts and Stories. 16x9 is",
          "landscape for YouTube or embedding on a website. Render both if unsure; they are",
          "separate jobs.",
          "",
          "The clip is silent by design — these platforms autoplay muted, so the message is",
          "carried on screen.",
        ].join("\n"),
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        inputSchema: z.object({
          slug: z.string().min(1).max(80).describe("Listing slug, as returned by create_listing."),
          orientation: z
            .enum(["9x16", "16x9"])
            .default("9x16")
            .describe("9x16 vertical for Reels and Stories; 16x9 landscape for YouTube or a site."),
        }),
      },
      async ({ slug, orientation }) => {
        try {
          const variant = (
            orientation === "16x9" ? "ListingVideo-16x9" : "ListingVideo-9x16"
          ) as VideoId;

          const listing = await listingStore().get(slug);
          if (!listing) {
            return {
              content: [
                {
                  type: "text",
                  text: `No listing named "${slug}". Use list_listings to see what is published.`,
                },
              ],
              isError: true,
            };
          }

          const job = await startVideoJob({ slug, variant });

          return {
            content: [
              {
                type: "text",
                text: [
                  `Job ${job.id} started — rendering ${orientation} for ${listing.listing.street}.`,
                  "",
                  `Poll with: get_render_job { "jobId": "${job.id}" }`,
                  "Expect roughly two minutes. Checking every 20-30 seconds is plenty.",
                ].join("\n"),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Could not start the render: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      },
    );

    server.registerTool(
      "get_render_job",
      {
        title: "Check A Render Job",
        description:
          "Status of a video render started by render_listing_video. Reports queued, running with a percentage, done with the video URL, or failed with the reason.",
        annotations: { readOnlyHint: true, openWorldHint: false },
        inputSchema: z.object({
          jobId: z.string().min(1).max(80).describe("As returned by render_listing_video."),
        }),
      },
      async ({ jobId }) => {
        const stored = await jobStore().get(jobId);
        // A sandbox render reports progress only when asked, so bring the
        // record up to date before answering.
        const job = stored ? await refreshJob(stored) : null;
        if (!job) {
          return {
            content: [{ type: "text", text: `No job with id ${jobId}.` }],
            isError: true,
          };
        }

        // A photo that could not be loaded is dropped rather than failing the
        // render, so the only place the agent can learn about it is here.
        const warnings = job.warnings?.length
          ? `\n\n${job.warnings.join("\n")}\nRe-share those files and render again to include them.`
          : "";

        if (job.status === "done") {
          const seconds = job.durationMs ? ` Rendered in ${Math.round(job.durationMs / 1000)}s.` : "";
          return {
            content: [
              {
                type: "text",
                text: `${job.outputUrl}\n\nDone — ${job.variant} for ${job.slug}.${seconds}${warnings}`,
              },
            ],
          };
        }

        if (job.status === "failed") {
          return {
            content: [
              { type: "text", text: `Render failed: ${job.error ?? "no reason recorded"}${warnings}` },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `${job.status} — ${job.progress}% (${job.variant} for ${job.slug}). Check again in 20-30 seconds.`,
            },
          ],
        };
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
                "covers it. Available fonts are Inter, Poppins and Playfair Display (400 and 700),",
                "plus DM Serif Display (400 only). Any other family silently falls back.",
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
              "A listing marketing renderer hosted on Vercel, speaking MCP.",
              "Tools: hello_world, echo, server_time, render_image,",
              "render_listing_carousel, delete_drive_file.",
              "",
              "Start with render://listing-guide for the carousel workflow, or",
              "render://guide for the markup rules behind render_image.",
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

/**
 * This is a ceiling, not a reservation — a call that finishes in 40ms is billed
 * for 40ms. It has to be this high because starting a video render creates a
 * Vercel Sandbox, which installs a browser and can take minutes; Remotion's own
 * creation timeout is five.
 *
 * That work runs inside `after()`, which is bounded by this same number. At the
 * previous 60 the function was killed mid-creation, the sandbox was orphaned,
 * and the job reported `expired` about eighty seconds in — long before the
 * eight-minute sandbox timeout it looked like it should have hit.
 */
export const maxDuration = 300;
