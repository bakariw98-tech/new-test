import { driveMode } from "../render/drive";
import { blobConfigured } from "../render/store";
import { listingStoreKind } from "../../../lib/store/listings";

export const runtime = "nodejs";

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
      drive: {
        mode: driveMode() ?? "not configured",
        GOOGLE_CLIENT_ID: describe("GOOGLE_CLIENT_ID"),
        GOOGLE_CLIENT_SECRET: describe("GOOGLE_CLIENT_SECRET"),
        GOOGLE_REFRESH_TOKEN: describe("GOOGLE_REFRESH_TOKEN"),
        GOOGLE_SERVICE_ACCOUNT_KEY: describe("GOOGLE_SERVICE_ACCOUNT_KEY"),
        GOOGLE_DRIVE_FOLDER_ID: describe("GOOGLE_DRIVE_FOLDER_ID"),
      },
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
