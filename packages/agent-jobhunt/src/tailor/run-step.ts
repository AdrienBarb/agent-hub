import "server-only";
import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { anthropic, MODELS } from "@hub/core/llm";
import { PROFILE_COMBINED } from "../profile";

type RunStepArgs<T extends z.ZodTypeAny> = {
  functionId: string;
  systemInstructions: string;
  userContent: string;
  schema: T;
};

export async function runTailorStep<T extends z.ZodTypeAny>({
  functionId,
  systemInstructions,
  userContent,
  schema,
}: RunStepArgs<T>): Promise<z.infer<T>> {
  const system = `${PROFILE_COMBINED}\n\n---\n\nINSTRUCTIONS\n\n${systemInstructions}`;

  try {
    const result = await generateObject({
      model: anthropic(MODELS.generator),
      schema,
      allowSystemInMessages: true,
      // Anthropic-native structured outputs (grammar-constrained decoding) via
      // `output_config.format`. Without this the SDK defaults to "jsonTool",
      // which wraps the schema in a generic `json` tool that Opus fills
      // unreliably (it nests the object under a spurious key like `input` or
      // returns `{}`), causing "No object generated: response did not match
      // schema". Native mode guarantees a top-level, schema-valid object.
      // Reproduce with scripts/rerun-tailor.ts; see the CLAUDE.md gotcha.
      providerOptions: {
        anthropic: { structuredOutputMode: "outputFormat" },
      },
      messages: [
        {
          role: "system",
          content: system,
          providerOptions: {
            anthropic: { cacheControl: { type: "ephemeral" } },
          },
        },
        { role: "user", content: userContent },
      ],
      experimental_telemetry: {
        isEnabled: true,
        functionId,
        recordInputs: false,
        // Suppress the tailored résumé/cover output from Langfuse traces (PII).
        recordOutputs: false,
      },
    });

    return result.object;
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      console.error(
        `[tailor/run-step] ${functionId} no object generated (finishReason=${err.finishReason}); raw="${(err.text ?? "").replace(/\s+/g, " ").slice(0, 300)}"`,
      );
    }
    throw err;
  }
}
