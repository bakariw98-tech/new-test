import { saveGoogleCredential } from "../../../../lib/store/credentials";
import { GOOGLE_SCOPES, oauthRedirectUri, page } from "../oauth";

export const runtime = "nodejs";

/**
 * GET /api/google/callback
 *
 * Where Google sends the agent back. Exchanges the one-time code for a refresh
 * token and stores it, so the connection is finished by the time this page
 * renders. The token is never shown — it goes into private Blob storage and
 * nothing else needs to see it.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");

  if (error) {
    return page(
      "Drive not connected",
      `<h1 class="bad">Drive not connected</h1><p>Google returned <code>${escapeHtml(error)}</code>.</p>` +
        `<p>Nothing has changed. <a href="/api/google/connect">Try again</a>.</p>`,
      400,
    );
  }

  if (!code) {
    return page(
      "Drive not connected",
      `<h1 class="bad">Missing authorisation code</h1>` +
        `<p>Start from <a href="/api/google/connect">/api/google/connect</a> rather than opening this page directly.</p>`,
      400,
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return page(
      "Drive not connected",
      `<h1 class="bad">This deployment has no OAuth client</h1><p>GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set.</p>`,
      500,
    );
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        // Must match the authorisation request exactly.
        redirect_uri: oauthRedirectUri(request),
        grant_type: "authorization_code",
      }),
    });

    const body = (await response.json()) as {
      refresh_token?: string;
      access_token?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (!response.ok) {
      return page(
        "Drive not connected",
        `<h1 class="bad">Google rejected the exchange</h1>` +
          `<p><code>${escapeHtml(body.error ?? String(response.status))}</code> — ${escapeHtml(body.error_description ?? "no detail given")}</p>` +
          `<p><a href="/api/google/connect">Try again</a>.</p>`,
        502,
      );
    }

    if (!body.refresh_token) {
      // Google withholds the refresh token when the app is already authorised
      // and prompt=consent was not honoured. Revoking and reconnecting fixes it.
      return page(
        "Drive not connected",
        `<h1 class="bad">No refresh token returned</h1>` +
          `<p>Google issues one only on a fresh authorisation. Remove this app at ` +
          `<a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a> and ` +
          `<a href="/api/google/connect">connect again</a>.</p>`,
        400,
      );
    }

    const granted = (body.scope ?? "").split(" ").filter(Boolean);
    const missing = GOOGLE_SCOPES.filter(
      (s) => !granted.includes(s) && s !== "https://www.googleapis.com/auth/userinfo.email",
    );

    await saveGoogleCredential({
      refreshToken: body.refresh_token,
      scope: body.scope ?? "",
      email: body.access_token ? await lookupEmail(body.access_token) : null,
      connectedAt: new Date().toISOString(),
    });

    const warning = missing.length
      ? `<p class="bad">Some permissions were not granted: <code>${escapeHtml(missing.join(", "))}</code>. ` +
        `Reading a folder of photos will fail. <a href="/api/google/connect">Reconnect</a> and tick every box.</p>`
      : "";

    return page(
      "Drive connected",
      `<h1 class="ok">Drive connected</h1>` +
        `<p>This deployment can now read listing photos from your Drive folders and deliver renders back into them.</p>` +
        warning +
        `<p>You can close this tab.</p>`,
    );
  } catch (cause) {
    return page(
      "Drive not connected",
      `<h1 class="bad">Could not complete the connection</h1><p>${escapeHtml(
        cause instanceof Error ? cause.message : String(cause),
      )}</p>`,
      500,
    );
  }
}

/** Best effort — a connection with an unknown email is still a good connection. */
async function lookupEmail(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    const { email } = (await response.json()) as { email?: string };
    return email ?? null;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
