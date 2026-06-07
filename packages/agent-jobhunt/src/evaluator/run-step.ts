import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import { anthropic, MODELS } from "@hub/core/llm";
import { PROFILE_COMBINED } from "../profile";

type RunStepArgs<T extends z.ZodTypeAny> = {
  functionId: string;
  systemInstructions: string;
  userContent: string;
  schema: T;
};

export async function runEvaluatorStep<T extends z.ZodTypeAny>({
  functionId,
  systemInstructions,
  userContent,
  schema,
}: RunStepArgs<T>): Promise<z.infer<T>> {
  const result = await generateObject({
    model: anthropic(MODELS.evaluator),
    schema,
    allowSystemInMessages: true,
    // Honors Anthropic's retry-after on 429s (SDK-native exponential backoff).
    // Cross-invocation concurrency is bounded by the evaluateJob function's
    // account-scoped Inngest `concurrency` key, not an in-process limiter.
    maxRetries: 6,
    // Anthropic-native structured outputs (see tailor/run-step.ts for the full
    // rationale). The evaluator schemas have no z.record/recursion, so native
    // grammar-constrained decoding applies cleanly and avoids the jsonTool
    // wrapping failure mode entirely.
    providerOptions: {
      anthropic: { structuredOutputMode: "outputFormat" },
    },
    messages: [
      // Cache-breakpoint split: the shared candidate profile (~3243 tok, above
      // Sonnet's 2048-token cache minimum) is its OWN system block carrying the
      // cacheControl breakpoint, so it is written ONCE and read at ~0.1x across
      // every evaluator node (compare/score/critique) and every job — instead of
      // being re-written inside each node's per-step prefix. The per-step
      // instructions follow in a second, uncached block.
      // ⚠️ Do NOT replicate this split in tailor/run-step.ts: that path runs on
      // Opus (4096-token cache minimum), so a profile-only breakpoint of ~3243 tok
      // sits BELOW the minimum and would SILENTLY cache nothing.
      {
        role: "system",
        content: PROFILE_COMBINED,
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
      },
      {
        role: "system",
        content: `---\n\nINSTRUCTIONS\n\n${systemInstructions}`,
      },
      { role: "user", content: userContent },
    ],
    experimental_telemetry: {
      isEnabled: true,
      functionId,
      recordInputs: false,
      // Suppress the evaluator output (fit reasoning / critique) from Langfuse.
      recordOutputs: false,
    },
  });

  return result.object;
}
