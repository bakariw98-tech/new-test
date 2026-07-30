# hello-world-mcp

A minimal [Model Context Protocol](https://modelcontextprotocol.io) server that AI agents can
connect to over HTTP, built as a Next.js route handler and deployed on Vercel.

It exists to answer one question quickly: *is the connection working?* Three tools, one resource,
and one prompt — enough to exercise every MCP primitive without any other moving parts.

## What it exposes

| Primitive | Name | Description |
| --- | --- | --- |
| Tool | `hello_world` | Greets the given `name` (defaults to `world`). The smoke test. |
| Tool | `echo` | Returns `message` verbatim, confirming arguments round-trip intact. |
| Tool | `server_time` | Current UTC time plus the Vercel region and environment it ran in. |
| Resource | `hello://info` | Static text describing this server. |
| Prompt | `greet` | Asks the model for a warm one-sentence greeting. |

The MCP endpoint is `POST /api/mcp`. Visiting `/` in a browser renders a page with the live
endpoint URL and copy-pasteable client config.

## Stack

- **Next.js 16** App Router — the route handler at `app/api/mcp/route.ts` is the whole server.
- **[`mcp-handler`](https://www.npmjs.com/package/mcp-handler) 2.x** — turns an MCP server
  definition into a Web-standard `(Request) => Response`, so it runs as a Vercel Function with no
  adapter code. It serves the `2026-07-28` spec natively and falls back to stateless Streamable
  HTTP for 2025-era clients, from the same handler.
- **`@modelcontextprotocol/server` 2.x** + **zod 4** — tool definitions and argument validation.

Stateless by design: no sessions, no Redis, no database. Every request is self-contained, which is
what makes it a good fit for serverless.

## Connecting an agent

Replace `<your-deployment>` with your deployment host.

**Claude Code**

```bash
claude mcp add --transport http hello-world https://<your-deployment>/api/mcp
```

**Cursor / Windsurf / Claude Desktop** (`mcpServers` config)

```json
{
  "mcpServers": {
    "hello-world": {
      "url": "https://<your-deployment>/api/mcp"
    }
  }
}
```

**stdio-only clients** — bridge with [`mcp-remote`](https://www.npmjs.com/package/mcp-remote):

```json
{
  "mcpServers": {
    "hello-world": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://<your-deployment>/api/mcp"]
    }
  }
}
```

## Local development

```bash
npm install
npm run dev          # http://localhost:3000/api/mcp
```

Verify without a client:

```bash
curl -sS -X POST http://localhost:3000/api/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

curl -sS -X POST http://localhost:3000/api/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"hello_world","arguments":{"name":"world"}}}'
```

Responses come back as `text/event-stream` frames (`event: message` / `data: {...}`) — that is
normal for Streamable HTTP, not an error.

Or point the MCP Inspector at it:

```bash
npx @modelcontextprotocol/inspector
```

## Deploying

Deploys to Vercel with no configuration — the route handler is detected as a Vercel Function.
`maxDuration` is set to 60s in `app/api/mcp/route.ts`.

If the deployment has **Deployment Protection** enabled (the default for preview deployments on
some plans), MCP clients will get a `401` because they cannot pass through Vercel's auth wall.
Either use a production deployment, disable protection for the project, or add a
protection-bypass token.

## Adding your own tool

Everything lives in one file. Add another `registerTool` call:

```ts
server.registerTool(
  "my_tool",
  {
    title: "My Tool",
    description: "What it does — the agent reads this to decide when to call it.",
    inputSchema: z.object({ query: z.string().describe("What to look up.") }),
  },
  async ({ query }) => ({
    content: [{ type: "text", text: `You asked for: ${query}` }],
  }),
);
```

Descriptions matter more than they look: they are the only thing an agent has to go on when
choosing a tool.

## Notes on auth

This server is unauthenticated — anyone who knows the URL can call it, which is fine for a
greeting but not for anything real. `mcp-handler` exports `withMcpAuth` and
`protectedResourceHandler` for OAuth bearer-token verification when you need it.
