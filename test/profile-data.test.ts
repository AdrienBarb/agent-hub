import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PROFILE_ME_MD,
  PROFILE_RESUME_YAML,
} from "../packages/agent-jobhunt/src/profile.generated";

// profile.generated.ts is a committed, generated bundle of profile/me.md +
// profile/resume-master.yaml (see gen-profile-data.ts). It must stay in sync
// with its source files — otherwise prod ships a stale profile silently.
// If this fails: `pnpm --filter @hub/agent-jobhunt profile:build`.
describe("profile.generated.ts is in sync with profile/ source files", () => {
  const profileDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "packages",
    "agent-jobhunt",
    "profile",
  );

  it("PROFILE_ME_MD matches profile/me.md", () => {
    expect(PROFILE_ME_MD).toBe(readFileSync(join(profileDir, "me.md"), "utf8"));
  });

  it("PROFILE_RESUME_YAML matches profile/resume-master.yaml", () => {
    expect(PROFILE_RESUME_YAML).toBe(
      readFileSync(join(profileDir, "resume-master.yaml"), "utf8"),
    );
  });
});
