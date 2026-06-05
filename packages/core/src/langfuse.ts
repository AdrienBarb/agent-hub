import "server-only";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { env } from "./env";

let sdk: NodeSDK | null = null;
let processor: LangfuseSpanProcessor | null = null;

export function setupLangfuse(): void {
  if (sdk) return;

  const publicKey = env.LANGFUSE_PUBLIC_KEY;
  const secretKey = env.LANGFUSE_SECRET_KEY;
  // Optional observability: with no Langfuse account, skip OTel setup entirely.
  // LLM telemetry spans then fall through to the global no-op tracer.
  if (!publicKey || !secretKey) return;

  processor = new LangfuseSpanProcessor({
    publicKey,
    secretKey,
    baseUrl: env.LANGFUSE_BASE_URL,
  });

  sdk = new NodeSDK({ spanProcessors: [processor] });
  sdk.start();
}

export async function flushLangfuse(): Promise<void> {
  await processor?.forceFlush();
}

export async function shutdownLangfuse(): Promise<void> {
  await processor?.forceFlush();
  await sdk?.shutdown();
  sdk = null;
  processor = null;
}
