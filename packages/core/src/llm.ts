import "server-only";
import { anthropic } from "@ai-sdk/anthropic";

export { anthropic };

export const MODELS = {
  evaluator: "claude-sonnet-4-6",
  generator: "claude-opus-4-7",
} as const;

export type ModelKey = keyof typeof MODELS;
