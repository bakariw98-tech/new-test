import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { renderToPng, SIZES } from "../render/render";
import { EXAMPLES, GUIDE, RULES_SUMMARY } from "../render/docs";
import { checkImageSources, explainRenderError, lintMarkup } from "../render/lint";

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
          "Rendering is done by Satori, not a browser, so the CSS surface is a subset.",
          "",
          RULES_SUMMARY,
          "",
          "Sizes: ig-portrait 1080x1350 (best default, most feed space), ig-square 1080x1080,",
          "ig-story 1080x1920, og 1200x630. All slides in one carousel must share a size.",
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
        }),
      },
      async ({ markup, size, width, height }) => {
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
            ...warnings.map((w) => `Warning: ${w}`),
          ];

          return {
            content: [
              {
                type: "image",
                data: Buffer.from(png).toString("base64"),
                mimeType: "image/png",
              },
              { type: "text", text: notes.join("\n") },
            ],
          };
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
                "   the same size or Instagram will crop them inconsistently.",
                "5. Show me the slides in order, and say what the hook is doing.",
                "",
                "Keep meaningful content out of the bottom 15% of each slide — the Instagram UI",
                "covers it. Only Inter 400 and 700 are available.",
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
