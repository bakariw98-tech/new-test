/**
 * Shared bits of the Google connection flow.
 *
 * The redirect URI has to be byte-identical between the authorisation request
 * and the token exchange or Google rejects it, so both routes derive it from
 * one function rather than each building their own.
 */

export const GOOGLE_SCOPES = [
  // Create and manage the renders this server puts into Drive.
  "https://www.googleapis.com/auth/drive.file",
  // Read a folder of listing photos the agent filled themselves. drive.file
  // cannot see those, because this app did not create them.
  "https://www.googleapis.com/auth/drive.readonly",
  // Which account got connected, so the UI can name it.
  "https://www.googleapis.com/auth/userinfo.email",
];

/**
 * Derived from the incoming request rather than from VERCEL_PROJECT_PRODUCTION_URL,
 * so a preview deployment redirects back to itself instead of to production.
 * Every origin used must be registered on the OAuth client.
 */
export function oauthRedirectUri(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const host = forwardedHost ?? url.host;
  const proto = forwardedProto ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/api/google/callback`;
}

export function page(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${title}</title>` +
      `<style>
        body{font:16px/1.6 ui-sans-serif,system-ui,sans-serif;max-width:34rem;margin:0 auto;padding:4rem 1.5rem;color:#101010}
        @media(prefers-color-scheme:dark){body{background:#0a0a0a;color:#ededed}}
        h1{font-size:1.5rem;margin:0 0 .5rem}
        code{background:rgba(128,128,128,.16);padding:.15em .4em;border-radius:4px;font-size:.9em}
        .ok{color:#16a34a}.bad{color:#dc2626}
        a{color:inherit}
      </style>${body}`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}
