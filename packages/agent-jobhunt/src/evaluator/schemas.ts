import "server-only";
import { z } from "zod";

export const RequirementsSchema = z.object({
  mustHaves: z
    .array(z.string())
    .describe("Hard requirements the candidate must meet, lifted from the JD"),
  niceToHaves: z
    .array(z.string())
    .describe("Optional or preferred skills mentioned in the JD"),
  seniorityLevel: z.enum([
    "junior",
    "mid",
    "senior",
    "lead",
    "staff",
    "principal",
  ]),
  primaryLanguage: z
    .enum(["en", "fr", "de", "it", "other"])
    .describe("Main language the job posting expects from the candidate"),
  workMode: z.enum(["onsite", "hybrid", "remote", "unknown"]),
  techStack: z
    .array(z.string())
    .describe("Technologies explicitly named in the JD"),
  location: z.string().describe("City or region where the job is based"),
  salaryRange: z
    .object({
      min: z.number().nullable(),
      max: z.number().nullable(),
      currency: z.string().nullable(),
    })
    .nullable(),
});

export const ComparisonSchema = z.object({
  stackOverlap: z
    .array(z.string())
    .describe("Technologies the candidate has that match the JD"),
  stackGaps: z
    .array(z.string())
    .describe("Technologies the JD requires that the candidate lacks"),
  seniorityMatch: z.enum(["yes", "no", "borderline"]),
  languageOk: z.boolean(),
  workModeOk: z.boolean(),
  locationOk: z.boolean(),
  salaryOk: z
    .boolean()
    .nullable()
    .describe("null when JD does not state a salary range"),
  redFlags: z
    .array(z.string())
    .describe("Reasons this job might not be a good fit"),
  positiveSignals: z
    .array(z.string())
    .describe("Reasons this job IS a good fit"),
});

export const ScoreSchema = z.object({
  // Generated FIRST, before the verdict (chain-of-thought). Grammar-constrained
  // structured outputs emit fields in schema order, so putting `reasoning` ahead of
  // `fitScore` forces the model to argue the fit BEFORE committing to a number,
  // instead of emitting a score and rationalizing it after the fact. Directly fights
  // the inflation SCORE_SYSTEM warns about. Used by both the score + critique nodes.
  reasoning: z
    .string()
    .describe(
      "Write this FIRST, before the score below. 2-3 sentences citing specific JD requirements and concrete candidate evidence (resume bullets, languages, geography). Weigh the tradeoffs here; confidence and fitScore must follow from this reasoning.",
    ),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe(
      "high = clearly above or below threshold; medium = uncertain; low = JD too sparse to score reliably",
    ),
  fitScore: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe(
      "Integer 1-10 per the scoring rubric. Must follow from the reasoning above — do not inflate.",
    ),
});

export type Requirements = z.infer<typeof RequirementsSchema>;
export type Comparison = z.infer<typeof ComparisonSchema>;
export type Score = z.infer<typeof ScoreSchema>;
