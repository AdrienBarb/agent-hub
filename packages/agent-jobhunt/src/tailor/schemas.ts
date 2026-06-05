import "server-only";
import { z } from "zod";

export const PlanSchema = z.object({
  // Decided FIRST (top of the schema) so every prose field generated after it
  // (coverHook, summaryRewrite) is written in this language under constrained
  // decoding. Keyed on the language the JD is WRITTEN in — distinct from the
  // evaluator's `requirements.primaryLanguage` (the working language expected).
  // Threaded verbatim into draft-resume / draft-cover via the serialized plan so
  // the whole application document stays in one language. See CLAUDE.md.
  outputLanguage: z
    .enum(["en", "fr"])
    .describe(
      "Language for ALL candidate-facing prose (summary, cover letter, reworded bullets). Set 'fr' ONLY when the job description text is written in French. Set 'en' when the JD is written in English, German, Italian, or any other language (the candidate is fluent in French and English, no German).",
    ),
  selectedBullets: z
    .array(
      z.object({
        roleIndex: z
          .number()
          .int()
          .min(0)
          .describe("Index of the role inside the master experience array"),
        engagementIndex: z
          .number()
          .int()
          .min(0)
          .nullable()
          .describe(
            "Index of the engagement inside that role, or null when bullets are directly on the role",
          ),
        bulletIndices: z
          .array(z.number().int().min(0))
          .min(1)
          .max(3)
          .describe(
            "1-3 bullet indices to keep for this role/engagement. Never empty — keep at least 1 bullet even when JD overlap is low.",
          ),
      }),
    )
    .describe(
      "Which bullets to keep per role/engagement, ordered by JD relevance",
    ),
  locationOverride: z
    .string()
    .describe(
      "Override for profile.location based on JD geography. Examples: 'Annecy, FR (cross-border to Geneva)' for Romandie, 'Annecy, FR (open to relocate to Zurich)' for German-Swiss, 'Annecy, FR (open to relocate within CH)' for ambiguous, or the original 'Annecy, FR' for fully remote.",
    ),
  coverHook: z
    .string()
    .describe(
      "The angle for the first paragraph of the cover letter: a specific company fact and how it connects to candidate's experience.",
    ),
  summaryRewrite: z
    .string()
    .describe(
      "Rewritten resume summary echoing JD keywords using only true facts from master. ~3 sentences.",
    ),
});

const LinkSchema = z.object({
  label: z.string(),
  url: z.string(),
});

const BulletSchema = z.object({
  text: z.string(),
  tags: z.array(z.string()).optional(),
});

const EngagementSchema = z.object({
  name: z.string(),
  duration: z.string().optional(),
  blurb: z.string().optional(),
  bullets: z.array(BulletSchema),
  stack: z.string().optional(),
});

const ExperienceSchema = z.object({
  company: z.string(),
  role: z.string(),
  url: z.string().optional(),
  start: z.string(),
  end: z.string(),
  duration: z.string().optional(),
  location: z.string().optional(),
  blurb: z.string().optional(),
  bullets: z.array(BulletSchema).optional(),
  engagements: z.array(EngagementSchema).optional(),
  stack: z.string().optional(),
});

const EducationSchema = z.object({
  school: z.string(),
  degree: z.string(),
  start: z.string(),
  end: z.string(),
  bullets: z.array(z.string()).optional(),
});

const LanguageSchema = z.object({
  name: z.string(),
  level: z.string(),
});

// Canonical resume shape (skills as a keyed map). Used to parse the hand-written
// resume-master.yaml and as the shape we serialize back to storage.
export const ResumeYamlSchema = z.object({
  profile: z.object({
    name: z.string(),
    title: z.string(),
    location: z.string(),
    phone: z.string(),
    email: z.string(),
    photo: z.string().optional(),
    links: z.array(LinkSchema),
  }),
  summary: z.string(),
  experience: z.array(ExperienceSchema),
  skills: z.record(z.string(), z.array(z.string())),
  education: z.array(EducationSchema),
  languages: z.array(LanguageSchema).optional(),
});

// Per-category skill tiers in the hand-written master. `expert` = used daily /
// recently shipped (the agent may frame as a strength); `knowledge` = known but
// not deep (listed on the resume, never framed as a strength, never in the
// summary/bullets). This is the SINGLE source of truth for skills — me.md lists none.
const SkillTierSchema = z.object({
  expert: z.array(z.string()).default([]),
  knowledge: z.array(z.string()).default([]),
});

// Hand-written master shape: identical to the serialized resume EXCEPT skills
// carry expert/knowledge tiers. Parsed from resume-master.yaml in profile.ts. The
// tiers are read by the LLM (via PROFILE_COMBINED) for honest framing; the
// rendered/serialized resume (ResumeYamlSchema) flattens skills back to name lists.
export const ResumeMasterSchema = ResumeYamlSchema.extend({
  skills: z.record(z.string(), SkillTierSchema),
});

const SkillCategorySchema = z.object({
  category: z.string().describe("Skill category name, e.g. 'Frontend'"),
  items: z.array(z.string()).describe("Skills listed under this category"),
});

// Model-output variant: skills as an ARRAY instead of a keyed map.
// Anthropic native structured outputs uses constrained decoding, which forces
// `additionalProperties: false` on every object. A free-key map (z.record) has
// no declared properties, so the grammar can only emit `{}` — skills come back
// EMPTY. An array of {category, items} gives the grammar a concrete shape to
// fill, then we convert back to the map shape via `resumeDraftToYaml` before
// storage. See the CLAUDE.md gotcha on native structured outputs.
export const ResumeDraftSchema = ResumeYamlSchema.extend({
  skills: z.array(SkillCategorySchema),
});

export function resumeDraftToYaml(draft: ResumeDraft): ResumeYaml {
  const skills: Record<string, string[]> = {};
  for (const { category, items } of draft.skills) {
    skills[category] = items;
  }
  return { ...draft, skills };
}

export const CoverDraftSchema = z.object({
  markdown: z
    .string()
    .describe(
      "Cover letter body in Markdown. ~250 words, 3 paragraphs. No em-dashes, no AI vocabulary, no compound coinages.",
    ),
});

export const AtsCheckResultSchema = z.object({
  ok: z.boolean(),
  issues: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
    }),
  ),
});

export type Plan = z.infer<typeof PlanSchema>;
export type ResumeYaml = z.infer<typeof ResumeYamlSchema>;
export type ResumeMaster = z.infer<typeof ResumeMasterSchema>;
export type ResumeDraft = z.infer<typeof ResumeDraftSchema>;
export type CoverDraft = z.infer<typeof CoverDraftSchema>;
export type AtsCheckResult = z.infer<typeof AtsCheckResultSchema>;
