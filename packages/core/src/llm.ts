import { anthropic } from "@ai-sdk/anthropic";

export { anthropic };

export const MODELS = {
  evaluator: "claude-sonnet-4-6",
  generator: "claude-opus-4-7",
  cheap: "claude-haiku-4-5-20251001",
} as const;

export type ModelKey = keyof typeof MODELS;
