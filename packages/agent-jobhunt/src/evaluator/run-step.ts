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
  const system = `${PROFILE_COMBINED}\n\n---\n\nINSTRUCTIONS\n\n${systemInstructions}`;

  const result = await generateObject({
    model: anthropic(MODELS.evaluator),
    schema,
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
    },
  });

  return result.object;
}
