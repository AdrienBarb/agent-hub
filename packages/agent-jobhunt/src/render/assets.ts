import "server-only";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Bundled render assets live at the package root (sibling of profile/), read at
// module load via import.meta.url — same pattern as profile.ts. On Vercel these
// need outputFileTracingIncludes; dev resolves fine from source.
const RENDER_ASSETS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "render-assets",
);

const FONT_FILES = [
  "LiberationSans-Regular.ttf",
  "LiberationSans-Bold.ttf",
  "LiberationSans-Italic.ttf",
  "LiberationSans-BoldItalic.ttf",
] as const;

export const renderAssets = {
  resumeTemplate: readFileSync(
    join(RENDER_ASSETS_DIR, "templates", "resume.typ"),
  ),
  coverTemplate: readFileSync(join(RENDER_ASSETS_DIR, "templates", "cover.typ")),
  photo: readFileSync(join(RENDER_ASSETS_DIR, "photo.png")),
  fonts: FONT_FILES.map((name) => ({
    name,
    bytes: readFileSync(join(RENDER_ASSETS_DIR, "fonts", name)),
  })),
};
