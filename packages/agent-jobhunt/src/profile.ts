import "server-only";
import { parse as yamlParse } from "yaml";
import { ResumeMasterSchema, type ResumeMaster } from "./tailor/schemas";
import { PROFILE_ME_MD, PROFILE_RESUME_YAML } from "./profile.generated";

// The profile is INLINED into the bundle (src/profile.generated.ts), not read
// from disk at runtime. Serverless functions on Vercel don't reliably ship a
// sibling workspace package's data files (packages/agent-jobhunt/profile/*)
// into the lambda via outputFileTracingIncludes — it crashed /api/inngest with
// ENOENT at import. A bundled import resolves identically under webpack,
// turbopack, vitest and tsx. Regenerate after editing profile/me.md or
// profile/resume-master.yaml: `pnpm --filter @hub/agent-jobhunt profile:build`.
export { PROFILE_ME_MD, PROFILE_RESUME_YAML };

export const PROFILE_RESUME_MASTER: ResumeMaster = ResumeMasterSchema.parse(
  yamlParse(PROFILE_RESUME_YAML),
);

// Cached reference material prepended to every tailor system prompt. Wrapped in
// XML tags (not markdown headers) so Claude gets a clean data/instruction boundary
// — the same convention the variable inputs use in the user message (<jd>, <plan>,
// …). The prompts (CACHED_CONTEXT in prompts.ts) reference these tag names directly.
// NOTE: this is TRUSTED content (it carries the skill-calibration rules the agent
// must follow), so it is deliberately NOT listed in the prompt-injection note.
export const PROFILE_COMBINED = [
  "<candidate_profile>",
  PROFILE_ME_MD,
  "</candidate_profile>",
  "",
  "<resume_master>",
  PROFILE_RESUME_YAML,
  "</resume_master>",
].join("\n");
