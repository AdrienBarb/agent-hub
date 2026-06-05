import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  transpilePackages: ["@hub/core", "@hub/agent-jobhunt"],
  serverExternalPackages: [
    "@prisma/client",
    "@opentelemetry/sdk-node",
    "@opentelemetry/api",
    "@langfuse/otel",
    "@vercel/sandbox",
  ],
  // Monorepo root, so file tracing resolves workspace packages correctly.
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  // render/assets.ts AND profile.ts read files at MODULE LOAD via readFileSync
  // (templates/fonts/photo, and the profile me.md + resume-master.yaml). Those
  // files aren't reachable by the bundler's static analysis, so without an
  // explicit trace include they're absent on Vercel and the readFileSync throws
  // ENOENT — crashing the whole /api/inngest function on import.
  // Globs are relative to this project dir (apps/dashboard).
  outputFileTracingIncludes: {
    "/api/inngest": [
      "../../packages/agent-jobhunt/render-assets/**",
      "../../packages/agent-jobhunt/profile/**",
    ],
  },
};

export default nextConfig;
