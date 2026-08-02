import { driveMode } from "../render/drive";
import { blobConfigured, publicOrigin } from "../render/store";
import { listingStoreKind } from "../../../lib/store/listings";
import { loadGoogleCredential } from "../../../lib/store/credentials";

export const runtime = "nodejs";

/**
 * Asks our own MCP endpoint what it serves.
 *
 * A real request rather than an import: the question this answers is "is the
 * endpoint reachable and speaking MCP", and only something that actually goes
 * over the wire can answer it. Importing the route module would also drag the
 * whole render dependency graph into this function for no benefit.
 *
 * `search` and `fetch` are called out because their absence is what makes a
 * working server unusable from a ChatGPT connector that is not in Developer
 * Mode — the failure reads as "the tool cannot be invoked", which sends people
 * looking for a bug that is not there.
 */
async function mcpStatus(url: string) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return { url, reachable: false, status: response.status };

    // The endpoint answers as SSE: an `event:` line, then the JSON on a `data:`
    // line. Scan for that line rather than assuming it comes first — assuming
    // it did is what made this report the endpoint unreachable while it was
    // answering perfectly.
    const body = await response.text();
    const payload =
      body
        .split("\n")
        .find((line) => line.startsWith("data:"))
        ?.slice("data:".length)
        .trim() ?? body;

    const tools = (JSON.parse(payload) as { result?: { tools?: Array<{ name: string }> } })
      .result?.tools;
    if (!tools) return { url, reachable: true, error: "tools/list returned no tool array" };

    const names = tools.map((t) => t.name);
    return {
      url,
      reachable: true,
      toolCount: names.length,
      // Both must be present for a ChatGPT connector to work without Developer
      // Mode; ChatGPT recognises no other tool names in that mode.
      chatgptDeepResearch: names.includes("search") && names.includes("fetch"),
      tools: names,
    };
  } catch (error) {
    return { url, reachable: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * GET /api/health
 *
 * Reports what the *running deployment* can see, which is the only way to tell
 * a missing environment variable apart from one set on the wrong environment or
 * added after the last build. Values are never returned — only whether each name
 * is present, and its length, which is enough to spot a truncated paste or a
 * value wrapped in quotes.
 */
export async function GET() {
  const describe = (name: string) => {
    const value = process.env[name];
    return value ? { set: true, length: value.length } : { set: false };
  };

  return Response.json(
    {
      deployment: {
        environment: process.env.VERCEL_ENV ?? "local",
        region: process.env.VERCEL_REGION ?? "local",
        commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "unknown",
        builtAt: process.env.VERCEL_DEPLOYMENT_ID ? undefined : "local",
      },
      google: await (async () => {
        const connected = await loadGoogleCredential();
        return connected
          ? {
              connected: true,
              email: connected.email,
              connectedAt: connected.connectedAt,
              canReadFolders: connected.scope.includes("drive.readonly"),
            }
          : { connected: false, source: process.env.GOOGLE_REFRESH_TOKEN ? "env" : "none" };
      })(),
      drive: {
        mode: driveMode() ?? "not configured",
        GOOGLE_CLIENT_ID: describe("GOOGLE_CLIENT_ID"),
        GOOGLE_CLIENT_SECRET: describe("GOOGLE_CLIENT_SECRET"),
        GOOGLE_REFRESH_TOKEN: describe("GOOGLE_REFRESH_TOKEN"),
        GOOGLE_SERVICE_ACCOUNT_KEY: describe("GOOGLE_SERVICE_ACCOUNT_KEY"),
        GOOGLE_DRIVE_FOLDER_ID: describe("GOOGLE_DRIVE_FOLDER_ID"),
      },
      mcp: await mcpStatus(`${publicOrigin()}/api/mcp`),
      blob: { configured: blobConfigured() },
      listings: {
        // blob = durable. file = local dev only. unavailable = deployed with
        // nowhere to write, so create_listing will refuse with setup steps.
        store: listingStoreKind(),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
