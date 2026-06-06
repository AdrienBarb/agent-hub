import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RESUME_TEMPLATE,
  COVER_TEMPLATE,
  PHOTO_PNG_BASE64,
  FONTS_BASE64,
} from "../packages/agent-jobhunt/src/render-assets.generated";

// render-assets.generated.ts is a committed, generated bundle of render-assets/
// (see gen-render-assets.ts). It must stay in sync with its source files —
// otherwise prod ships stale templates/fonts silently.
// If this fails: `pnpm --filter @hub/agent-jobhunt render-assets:build`.
describe("render-assets.generated.ts is in sync with render-assets/ source", () => {
  const dir = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "packages",
    "agent-jobhunt",
    "render-assets",
  );

  it("templates match", () => {
    expect(RESUME_TEMPLATE).toBe(
      readFileSync(join(dir, "templates", "resume.typ"), "utf8"),
    );
    expect(COVER_TEMPLATE).toBe(
      readFileSync(join(dir, "templates", "cover.typ"), "utf8"),
    );
  });

  it("photo matches", () => {
    expect(PHOTO_PNG_BASE64).toBe(readFileSync(join(dir, "photo.png")).toString("base64"));
  });

  it("all four Liberation Sans fonts match", () => {
    for (const name of [
      "LiberationSans-Regular.ttf",
      "LiberationSans-Bold.ttf",
      "LiberationSans-Italic.ttf",
      "LiberationSans-BoldItalic.ttf",
    ]) {
      expect(FONTS_BASE64[name]).toBe(
        readFileSync(join(dir, "fonts", name)).toString("base64"),
      );
    }
  });
});
