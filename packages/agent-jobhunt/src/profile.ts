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

export const PROFILE_COMBINED = [
  "# Candidate Profile",
  "",
  PROFILE_ME_MD,
  "",
  "---",
  "",
  "# Resume Master (structured experience)",
  "",
  PROFILE_RESUME_YAML,
].join("\n");
