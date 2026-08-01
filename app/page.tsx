import { headers } from "next/headers";

const TOOLS = [
  ["hello_world", "Returns a friendly greeting. The connectivity smoke test."],
  ["echo", "Echoes text back verbatim, so you can confirm arguments round-trip."],
  ["server_time", "Current UTC time plus the Vercel region and environment."],
  ["render_image", "Renders HTML markup to a PNG at Instagram or OG sizes."],
  [
    "render_listing_carousel",
    "Builds a full property carousel from listing data and photos, and can deliver it into Google Drive.",
  ],
  ["delete_drive_file", "Deletes a Drive file this server created, so a bad render can be replaced."],
] as const;

export default async function Home() {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const mcpUrl = `${proto}://${host}/api/mcp`;

  return (
    <main>
      <h1>hello-world-mcp</h1>
      <p className="tagline">A minimal Model Context Protocol server, running on Vercel.</p>

      <div className="status">
        <span className="dot" aria-hidden />
        Endpoint live at <code>/api/mcp</code>
      </div>

      <h2>Connect</h2>
      <p>Point any MCP client that speaks Streamable HTTP at this URL:</p>
      <pre>
        <code>{mcpUrl}</code>
      </pre>

      <p>
        For Claude Code: <code>{`claude mcp add --transport http hello-world ${mcpUrl}`}</code>
      </p>

      <p>For clients that only speak stdio, bridge with mcp-remote:</p>
      <pre>
        <code>{JSON.stringify(
          {
            mcpServers: {
              "hello-world": {
                command: "npx",
                args: ["-y", "mcp-remote", mcpUrl],
              },
            },
          },
          null,
          2,
        )}</code>
      </pre>

      <h2>Tools</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>What it does</th>
          </tr>
        </thead>
        <tbody>
          {TOOLS.map(([name, description]) => (
            <tr key={name}>
              <td>
                <code>{name}</code>
              </td>
              <td>{description}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p>
        Also exposed: the <code>hello://info</code> resource and the <code>greet</code> prompt, so all
        three MCP primitives can be exercised.
      </p>

      <h2>Verify from the terminal</h2>
      <pre>
        <code>{`curl -sS -X POST ${mcpUrl} \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json, text/event-stream' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}</code>
      </pre>

      <h2>Render an image over plain HTTP</h2>
      <p>
        The same renderer behind <code>render_image</code> is exposed at <code>/api/render</code>,
        which is handy for saving a PNG straight to disk.
      </p>
      <pre>
        <code>{`curl -X POST ${proto}://${host}/api/render \\
  -H 'Content-Type: application/json' \\
  -d '{"size":"ig-portrait","markup":"<div style=\\"display:flex;width:100%;height:100%;background:#111;color:#fff;align-items:center;justify-content:center;font-size:96px\\">Hello</div>"}' \\
  -o slide.png`}</code>
      </pre>
    </main>
  );
}
