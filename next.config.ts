import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The render routes read font files from @fontsource at request time. Next
  // cannot trace a runtime path.join, so name them explicitly or they are
  // missing from the deployed function bundle and every render fails.
  outputFileTracingIncludes: {
    "/api/render": ["./node_modules/@fontsource/*/files/*-latin-*-normal.woff"],
    "/api/mcp": ["./node_modules/@fontsource/*/files/*-latin-*-normal.woff"],
  },
};

export default nextConfig;
