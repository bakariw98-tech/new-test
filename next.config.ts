import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The render routes read font files from @fontsource at request time. Next
  // cannot trace a runtime path.join, so name them explicitly or they are
  // missing from the deployed function bundle and every render fails.
  outputFileTracingIncludes: {
    "/api/render": ["./node_modules/@fontsource/*/files/*-latin-*-normal.woff"],
    "/api/mcp": [
      "./node_modules/@fontsource/*/files/*-latin-*-normal.woff",
      // The Remotion bundle, built by `npm run build` before Next runs. A
      // Sandbox render copies this directory across; building it at request
      // time needs rspack's native binary, which is not in the function.
      "./.remotion-bundle/**/*",
    ],
  },

  // Remotion's renderer picks its native compositor by platform at runtime.
  // Bundling it makes webpack try to resolve every platform's binary at build
  // time, including Windows, and the build fails on a package that will never
  // be installed. Left external, the require happens at runtime on the one
  // platform that matters.
  serverExternalPackages: ["@remotion/renderer", "@remotion/bundler", "@remotion/compositor-linux-x64-gnu"],
};

export default nextConfig;
