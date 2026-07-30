# hello-world-mcp

A minimal [Model Context Protocol](https://modelcontextprotocol.io) server that AI agents can
connect to over HTTP, built as a Next.js route handler and deployed on Vercel.

It exists to answer one question quickly: *is the connection working?* Three tools, one resource,
and one prompt — enough to exercise every MCP primitive without any other moving parts.

**Live endpoint:** `https://hello-world-mcp.vercel.app/api/mcp`

## What it exposes

| Primitive | Name | Description |
| --- | --- | --- |
| Tool | `hello_world` | Greets the given `name` (defaults to `world`). The smoke test. |
| Tool | `echo` | Returns `message` verbatim, confirming arguments round-trip intact. |
| Tool | `server_time` | Current UTC time plus the Vercel region and environment it ran in. |
| Tool | `render_image` | Renders HTML markup to a PNG at Instagram or OG sizes. |
| Resource | `hello://info` | Static text describing this server. |
| Prompt | `greet` | Asks the model for a warm one-sentence greeting. |

## Rendering images

`render_image` composes social assets from code instead of generating them with an image model:
generate the hero asset once with the expensive model, then derive carousel slides, stories, and OG
cards from it for effectively free.

Rendering goes through [Satori](https://github.com/vercel/satori) rather than a browser, so the CSS
surface is a subset. The constraints that actually bite:

- **Inline `style` attributes only** — no `<style>` blocks, stylesheets, or selectors
- **Flexbox only, no CSS grid**, and the root element must set `display: flex`
- Any element with more than one child needs an explicit `display: flex`
- `filter` supports `blur`, `brightness`, `contrast`, `grayscale`, `invert`, `saturate`, `sepia` —
  but there are no LUTs, curves, or per-channel controls, so this is stylization rather than a
  real grading pipeline
- Images need an absolute `https` URL or a data URI; local paths do not resolve
- Inter 400 and 700 are the available fonts

Size presets: `ig-portrait` 1080×1350 (best carousel real estate), `ig-square` 1080×1080,
`ig-story` 1080×1920, `og` 1200×630. Or pass explicit `width` and `height`.

The same renderer is exposed over plain HTTP at `POST /api/render`, which is handy for saving a
file directly:

```bash
curl -X POST https://hello-world-mcp.vercel.app/api/render \
  -H 'Content-Type: application/json' \
  -d '{"size":"ig-portrait","markup":"<div style=\"display:flex;width:100%;height:100%;background:#111;color:#fff;align-items:center;justify-content:center;font-size:96px\">Hello</div>"}' \
  -o slide.png
```

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

**Claude Code**

```bash
claude mcp add --transport http hello-world https://hello-world-mcp.vercel.app/api/mcp
```

**Cursor / Windsurf / Claude Desktop** (`mcpServers` config)

```json
{
  "mcpServers": {
    "hello-world": {
      "url": "https://hello-world-mcp.vercel.app/api/mcp"
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
      "args": ["-y", "mcp-remote", "https://hello-world-mcp.vercel.app/api/mcp"]
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

**Deployment Protection must be off.** If it is enabled, MCP clients get a `401` — they cannot
pass through Vercel's auth wall. Note that Vercel Authentication can be scoped to
`all_except_custom_domains`, which covers production too, so deploying to production is not on its
own enough. Either disable it for the project, or add a protection-bypass token that your client
can send as a header.

Fonts are read from `@fontsource/inter` at request time. Next cannot trace a runtime `path.join`,
so `next.config.ts` names them under `outputFileTracingIncludes` — without that the deployed
function is missing its fonts and every render fails with `ENOENT`.

This project was deployed via direct file upload, so it is **not linked to this Git repository** —
pushing to the repo does not redeploy it. Connect the repo in the Vercel dashboard if you want
automatic deploys on push.

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
