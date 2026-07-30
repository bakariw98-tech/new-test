import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { renderToPng, SIZES } from "../render/render";

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
          "Renders HTML markup to a PNG image and returns it. Use this to compose social assets",
          "(Instagram carousel slides, stories, OG cards) from code instead of generating them.",
          "",
          "Constraints, because this renders via Satori rather than a browser:",
          "- Inline `style` attributes only. No <style> blocks, stylesheets, or CSS selectors.",
          "- Flexbox only, no CSS grid. The root element must set `display: flex`.",
          "- Every element containing more than one child needs an explicit `display: flex`.",
          "- `filter` supports blur, brightness, contrast, grayscale, invert, saturate, sepia.",
          "- Images need an absolute https URL or a data URI. Local paths will not resolve.",
          "- Fonts available: Inter at weight 400 and 700.",
        ].join("\n"),
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
        try {
          const png = await renderToPng({ markup, size, width, height });
          const dimensions =
            width && height ? { width, height } : SIZES[size];

          return {
            content: [
              {
                type: "image",
                data: Buffer.from(png).toString("base64"),
                mimeType: "image/png",
              },
              {
                type: "text",
                text: `Rendered ${dimensions.width}x${dimensions.height} PNG, ${(png.byteLength / 1024).toFixed(1)} KB.`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Render failed: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      },
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
