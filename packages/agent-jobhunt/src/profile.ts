import "server-only";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse as yamlParse } from "yaml";
import { ResumeMasterSchema, type ResumeMaster } from "./tailor/schemas";

const PROFILE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "profile",
);

export const PROFILE_ME_MD = readFileSync(join(PROFILE_DIR, "me.md"), "utf8");

export const PROFILE_RESUME_YAML = readFileSync(
  join(PROFILE_DIR, "resume-master.yaml"),
  "utf8",
);

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
