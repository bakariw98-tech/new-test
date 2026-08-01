import { redirect } from "next/navigation";
import { GOOGLE_SCOPES, oauthRedirectUri } from "../oauth";

export const runtime = "nodejs";

/**
 * GET /api/google/connect
 *
 * Starts the Google consent flow. An agent clicks "Connect Google Drive", picks
 * an account, approves, and lands back on /api/google/callback with the
 * connection already stored — no codes to copy out of an address bar.
 *
 * `prompt=consent` is not optional here. Google only returns a refresh token on
 * the first authorisation for a client, so a reconnect after a scope change
 * would otherwise come back with an access token and nothing durable.
 */
export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return new Response(
      "GOOGLE_CLIENT_ID is not set on this deployment, so there is no OAuth client to connect to.",
      { status: 500, headers: { "Content-Type": "text/plain" } },
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: oauthRedirectUri(request),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });

  redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
