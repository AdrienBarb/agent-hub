// Inlines render-assets/ (Typst templates + Liberation Sans fonts + photo) into
// src/render-assets.generated.ts so they ship INSIDE the JS bundle instead of
// being read from disk at runtime. Serverless functions on Vercel don't reliably
// ship sibling-package data files (packages/agent-jobhunt/render-assets/*) into
// the lambda via Next's outputFileTracingIncludes — render/assets.ts reads them
// at module load, so a miss crashes /api/inngest with ENOENT (same root cause as
// the profile; see gen-profile-data.ts).
//
// Run after changing anything in render-assets/:
//   pnpm --filter @hub/agent-jobhunt render-assets:build
// Drift-guarded by test/render-assets-data.test.ts.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = join(pkgRoot, "render-assets");

const FONT_FILES = [
  "LiberationSans-Regular.ttf",
  "LiberationSans-Bold.ttf",
  "LiberationSans-Italic.ttf",
  "LiberationSans-BoldItalic.ttf",
];

const resumeTemplate = readFileSync(join(assetsDir, "templates", "resume.typ"), "utf8");
const coverTemplate = readFileSync(join(assetsDir, "templates", "cover.typ"), "utf8");
const photoB64 = readFileSync(join(assetsDir, "photo.png")).toString("base64");
const fontsEntries = FONT_FILES.map((name) => [
  name,
  readFileSync(join(assetsDir, "fonts", name)).toString("base64"),
]);

const fontsObject = fontsEntries
  .map(([name, b64]) => `  ${JSON.stringify(name)}: ${JSON.stringify(b64)},`)
  .join("\n");

const out = `// AUTO-GENERATED — do not edit by hand.
// Source: render-assets/ (templates/*.typ, photo.png, fonts/*.ttf)
// Regenerate: pnpm --filter @hub/agent-jobhunt render-assets:build
/* eslint-disable */

export const RESUME_TEMPLATE = ${JSON.stringify(resumeTemplate)};

export const COVER_TEMPLATE = ${JSON.stringify(coverTemplate)};

export const PHOTO_PNG_BASE64 = ${JSON.stringify(photoB64)};

export const FONTS_BASE64: Record<string, string> = {
${fontsObject}
};
`;

const target = join(pkgRoot, "src", "render-assets.generated.ts");
writeFileSync(target, out);
const totalKb = Math.round(out.length / 1024);
console.log(`✓ wrote ${target} (${totalKb} KB, ${fontsEntries.length} fonts)`);
