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
  // Files loaded at MODULE LOAD (or dynamically) that the bundler can't see via
  // static analysis, so they must be explicitly traced into each serverless
  // function — otherwise they're absent on Vercel (ENOENT / "Query Engine not
  // found"). Globs are relative to this project dir (apps/dashboard);
  // outputFileTracingRoot above is the repo root, so traced files land at the
  // same repo-relative path the runtime resolves.
  //
  // PRISMA_ENGINE: serverExternalPackages keeps @prisma/client out of the bundle,
  // but the dynamically-loaded query-engine .node binary isn't traced — copy it
  // next to every Prisma-using route's bundle (binaryTargets in schema.prisma
  // generates the rhel-openssl-3.0.x engine the Vercel runtime needs).
  outputFileTracingIncludes: {
    // /api/inngest runs the agent graph. Both the candidate profile and the
    // render assets are now inlined into the bundle (src/profile.generated.ts,
    // src/render-assets.generated.ts), so no sibling-package files need tracing
    // here — only the Prisma query engine (a node_modules binary, which DOES
    // trace reliably).
    "/api/inngest": [
      "../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/*.node",
    ],
    "/api/job-hunt/jobs": [
      "../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/*.node",
    ],
    "/api/job-hunt/jobs/[id]": [
      "../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/*.node",
    ],
    "/api/job-hunt/run": [
      "../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/*.node",
    ],
    "/api/job-hunt/run/status": [
      "../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/*.node",
    ],
    "/api/job-hunt/artifact": [
      "../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/*.node",
    ],
  },
};

export default nextConfig;
