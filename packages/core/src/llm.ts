import "server-only";
import { anthropic } from "@ai-sdk/anthropic";

export { anthropic };

export const MODELS = {
  // Cheapest tier for the highest-volume, judgement-free call: JD requirement
  // extraction (one per scraped job). Extraction is mechanical and unbiased (no
  // profile prepended), so Haiku is sufficient and ~67% cheaper than Sonnet.
  extractor: "claude-haiku-4-5",
  // Fit reasoning (compare/score/critique) + dedupe adjudication. Sonnet keeps
  // the profile prompt-cache hit (~3243 tok > Sonnet's 2048 min); Haiku would
  // silently lose it (3243 < Haiku's 4096 min) on top of weaker judgement.
  evaluator: "claude-sonnet-4-6",
  // Candidate-facing tailoring (plan/draft-resume/draft-cover/revise).
  generator: "claude-opus-4-7",
} as const;

export type ModelKey = keyof typeof MODELS;
