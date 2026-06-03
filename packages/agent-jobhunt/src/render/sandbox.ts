import "server-only";
import { Sandbox } from "@vercel/sandbox";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { env } from "@hub/core/env";
import { renderAssets } from "./assets";
import type { RenderInput, RenderOutput, Renderer } from "./types";

// Sandbox filesystem layout. Typst requires the entry template to live inside
// --root, so root is /vercel/sandbox and templates sit under it. Per-job data
// uses absolute-under-root paths so parallel jobs never collide.
const ROOT = "/vercel/sandbox";
const FONTS_DIR = `${ROOT}/assets/fonts`;
const TEMPLATES_DIR = `${ROOT}/assets/templates`;
const JOBS_DIR = `${ROOT}/jobs`;

// Generous timeout so the sandbox can't auto-expire mid-run — it must outlive
// the Vercel function budget (Pro = 800s).
const SANDBOX_TIMEOUT_MS = 900_000;

// One warm sandbox per process, shared across parallel tailor sub-graphs.
// Memoized as a promise so concurrent first-callers await the same creation.
let sandboxPromise: Promise<Sandbox> | undefined;
// Every sandbox we successfully start is tracked here so disposeRenderSandbox
// stops ALL of them — even an orphan from a retried/concurrent provision.
const liveSandboxes = new Set<Sandbox>();

async function run(
  sandbox: Sandbox,
  cmd: string,
  args: string[],
  opts: { sudo?: boolean } = {},
): Promise<void> {
  const res = await sandbox.runCommand({ cmd, args, sudo: opts.sudo });
  if (res.exitCode !== 0) {
    const stderr = await res.stderr();
    throw new Error(
      `[render] \`${cmd} ${args.join(" ")}\` failed (exit ${res.exitCode}): ${stderr.slice(0, 800)}`,
    );
  }
}

async function installTypst(sandbox: Sandbox): Promise<void> {
  const version = env.RENDER_TYPST_VERSION;
  const url = `https://github.com/typst/typst/releases/download/v${version}/typst-x86_64-unknown-linux-musl.tar.xz`;
  await run(sandbox, "dnf", ["install", "-y", "tar", "xz"], { sudo: true });
  await run(sandbox, "curl", ["-fsSL", url, "-o", "/tmp/typst.tar.xz"]);
  await run(sandbox, "tar", ["-xJf", "/tmp/typst.tar.xz", "-C", "/tmp"]);
  // Release tarballs nest the binary under a target-triple dir
  // (typst-x86_64-unknown-linux-musl/typst); fall back to the archive root in
  // case a future release flattens it.
  await run(
    sandbox,
    "sh",
    [
      "-c",
      "mv /tmp/typst-*/typst /usr/local/bin/typst 2>/dev/null || mv /tmp/typst /usr/local/bin/typst; chmod +x /usr/local/bin/typst",
    ],
    { sudo: true },
  );
  await run(sandbox, "typst", ["--version"]);
}

async function writeSharedAssets(sandbox: Sandbox): Promise<void> {
  await run(sandbox, "mkdir", ["-p", FONTS_DIR, TEMPLATES_DIR, JOBS_DIR]);
  await sandbox.writeFiles([
    { path: `${TEMPLATES_DIR}/resume.typ`, content: renderAssets.resumeTemplate },
    { path: `${TEMPLATES_DIR}/cover.typ`, content: renderAssets.coverTemplate },
    ...renderAssets.fonts.map((f) => ({
      path: `${FONTS_DIR}/${f.name}`,
      content: f.bytes,
    })),
  ]);
}

async function createAndProvision(): Promise<Sandbox> {
  const token = env.VERCEL_TOKEN;
  let sandbox: Sandbox;
  if (token) {
    const teamId = env.VERCEL_TEAM_ID;
    const projectId = env.VERCEL_PROJECT_ID;
    if (!teamId || !projectId) {
      throw new Error(
        "[render] VERCEL_TOKEN is set but VERCEL_TEAM_ID/VERCEL_PROJECT_ID are missing — all three are required for Sandbox token auth.",
      );
    }
    sandbox = await Sandbox.create({
      runtime: "node24",
      timeout: SANDBOX_TIMEOUT_MS,
      token,
      teamId,
      projectId,
    });
  } else if (process.env.VERCEL_OIDC_TOKEN) {
    sandbox = await Sandbox.create({
      runtime: "node24",
      timeout: SANDBOX_TIMEOUT_MS,
    });
  } else {
    throw new Error(
      "[render] No Vercel credentials. Set VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID in .env.local (or run on Vercel with OIDC).",
    );
  }

  liveSandboxes.add(sandbox);
  try {
    await installTypst(sandbox);
    await writeSharedAssets(sandbox);
  } catch (err) {
    liveSandboxes.delete(sandbox);
    await sandbox.stop().catch(() => {});
    throw err;
  }
  return sandbox;
}

/** Set profile.photo to the per-job path the renderer writes the photo to, so
 * it always resolves under --root regardless of what the LLM emitted. */
function withPhotoPath(resumeYaml: string, photoPath: string): string {
  const doc = yamlParse(resumeYaml) as { profile?: { photo?: string } };
  if (doc && typeof doc === "object" && doc.profile) {
    doc.profile.photo = photoPath;
  }
  return yamlStringify(doc);
}

export class SandboxRenderer implements Renderer {
  async render({ jobId, resumeYaml, coverMd, lang }: RenderInput): Promise<RenderOutput> {
    if (!sandboxPromise) {
      // Reset the memo if creation fails so a later call can retry instead of
      // resolving the cached rejection forever.
      sandboxPromise = createAndProvision().catch((err) => {
        sandboxPromise = undefined;
        throw err;
      });
    }
    const sandbox = await sandboxPromise;

    const workdir = `${JOBS_DIR}/${jobId}`;
    const yamlForRender = withPhotoPath(resumeYaml, `/jobs/${jobId}/assets/photo.png`);

    await run(sandbox, "mkdir", ["-p", `${workdir}/assets`]);
    await sandbox.writeFiles([
      { path: `${workdir}/resume.yaml`, content: yamlForRender },
      { path: `${workdir}/cover.md`, content: coverMd },
      { path: `${workdir}/assets/photo.png`, content: renderAssets.photo },
    ]);

    await run(sandbox, "typst", [
      "compile",
      "--root", ROOT,
      "--font-path", FONTS_DIR,
      "--input", `data=/jobs/${jobId}/resume.yaml`,
      "--input", `lang=${lang}`,
      `${TEMPLATES_DIR}/resume.typ`,
      `${workdir}/resume.pdf`,
    ]);
    await run(sandbox, "typst", [
      "compile",
      "--root", ROOT,
      "--font-path", FONTS_DIR,
      "--input", `data=/jobs/${jobId}/resume.yaml`,
      "--input", `cover=/jobs/${jobId}/cover.md`,
      "--input", `lang=${lang}`,
      `${TEMPLATES_DIR}/cover.typ`,
      `${workdir}/cover.pdf`,
    ]);

    const resumePdf = await sandbox.readFileToBuffer({ path: `${workdir}/resume.pdf` });
    const coverPdf = await sandbox.readFileToBuffer({ path: `${workdir}/cover.pdf` });
    if (!resumePdf || !coverPdf) {
      throw new Error(`[render] ${jobId}: typst produced no PDF`);
    }
    return { resumePdf, coverPdf };
  }
}

/** Stop every started sandbox and reset the singleton (idempotent). */
export async function disposeRenderSandbox(): Promise<void> {
  const pending = sandboxPromise;
  sandboxPromise = undefined;
  // Drain any in-flight creation so its sandbox is tracked (or its failure
  // settled) before we stop everything.
  if (pending) {
    await pending.catch(() => {});
  }
  const sandboxes = [...liveSandboxes];
  liveSandboxes.clear();
  await Promise.all(
    sandboxes.map((s) =>
      s.stop().catch((err) =>
        console.error(
          "[render] sandbox.stop failed:",
          err instanceof Error ? err.message : err,
        ),
      ),
    ),
  );
}
