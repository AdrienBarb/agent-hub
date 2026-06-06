// Inlines profile/me.md + profile/resume-master.yaml into src/profile.generated.ts
// so the candidate profile ships INSIDE the JS bundle instead of being read from
// disk at runtime. Serverless functions on Vercel don't reliably ship
// sibling-package data files (packages/agent-jobhunt/profile/*) into the lambda
// via Next's outputFileTracingIncludes, which crashed /api/inngest with ENOENT.
//
// Run after editing profile/me.md or profile/resume-master.yaml:
//   pnpm --filter @hub/agent-jobhunt profile:build
// A drift-guard test (test/profile-data.test.ts) fails if this is left stale.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const meMd = readFileSync(join(pkgRoot, "profile", "me.md"), "utf8");
const resumeYaml = readFileSync(
  join(pkgRoot, "profile", "resume-master.yaml"),
  "utf8",
);

const out = `// AUTO-GENERATED — do not edit by hand.
// Source: profile/me.md + profile/resume-master.yaml
// Regenerate: pnpm --filter @hub/agent-jobhunt profile:build

export const PROFILE_ME_MD = ${JSON.stringify(meMd)};

export const PROFILE_RESUME_YAML = ${JSON.stringify(resumeYaml)};
`;

const target = join(pkgRoot, "src", "profile.generated.ts");
writeFileSync(target, out);
console.log(`✓ wrote ${target} (${meMd.length} + ${resumeYaml.length} chars)`);
