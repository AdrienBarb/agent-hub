import "server-only";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { env } from "./env";

let sdk: NodeSDK | null = null;
let processor: LangfuseSpanProcessor | null = null;

export function setupLangfuse(): void {
  if (sdk) return;

  processor = new LangfuseSpanProcessor({
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
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
