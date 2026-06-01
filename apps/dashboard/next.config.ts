import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@hub/core", "@hub/agent-jobhunt"],
  serverExternalPackages: [
    "@prisma/client",
    "@opentelemetry/sdk-node",
    "@opentelemetry/api",
    "@langfuse/otel",
  ],
};

export default nextConfig;
