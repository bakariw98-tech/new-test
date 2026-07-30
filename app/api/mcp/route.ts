import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

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
              "Tools: hello_world, echo, server_time.",
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

export const maxDuration = 60;
