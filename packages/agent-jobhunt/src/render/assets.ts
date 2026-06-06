import "server-only";
import {
  RESUME_TEMPLATE,
  COVER_TEMPLATE,
  PHOTO_PNG_BASE64,
  FONTS_BASE64,
} from "../render-assets.generated";

// Render assets are INLINED into the bundle (src/render-assets.generated.ts),
// not read from disk at runtime. Serverless functions on Vercel don't reliably
// ship a sibling workspace package's data files (render-assets/*) into the
// lambda via outputFileTracingIncludes — it crashed /api/inngest with ENOENT at
// import (same root cause as the profile). Bundled imports resolve identically
// under webpack, turbopack, vitest and tsx. Regenerate after editing
// render-assets/: `pnpm --filter @hub/agent-jobhunt render-assets:build`.
export const renderAssets = {
  resumeTemplate: Buffer.from(RESUME_TEMPLATE, "utf8"),
  coverTemplate: Buffer.from(COVER_TEMPLATE, "utf8"),
  photo: Buffer.from(PHOTO_PNG_BASE64, "base64"),
  fonts: Object.entries(FONTS_BASE64).map(([name, base64]) => ({
    name,
    bytes: Buffer.from(base64, "base64"),
  })),
};
