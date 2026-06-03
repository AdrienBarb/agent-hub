import "server-only";
import { generateObject } from "ai";
import { anthropic, MODELS } from "@hub/core/llm";
import { EXTRACT_SYSTEM } from "../prompts";
import { RequirementsSchema } from "../schemas";
import type { EvaluatorStateType } from "../state";

export async function extractNode(
  state: EvaluatorStateType,
): Promise<Partial<EvaluatorStateType>> {
  const result = await generateObject({
    model: anthropic(MODELS.evaluator),
    schema: RequirementsSchema,
    allowSystemInMessages: true,
    // Anthropic-native structured outputs — see tailor/run-step.ts + CLAUDE.md.
    providerOptions: {
      anthropic: { structuredOutputMode: "outputFormat" },
    },
    messages: [
      { role: "system", content: EXTRACT_SYSTEM },
      {
        role: "user",
        content: `<jd>\n${state.rawMarkdown}\n</jd>`,
      },
    ],
    experimental_telemetry: {
      isEnabled: true,
      functionId: "jobhunt/evaluate/extract",
      // This block had neither flag: recordInputs:false stops capturing the raw
      // scraped JD; recordOutputs:false stops the extracted requirements.
      recordInputs: false,
      recordOutputs: false,
    },
  });

  console.log(
    `[evaluate/extract] ${state.jobId} mustHaves=${result.object.mustHaves.length} stack=${result.object.techStack.length}`,
  );

  return { requirements: result.object };
}
