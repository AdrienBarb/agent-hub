/**
 * Smoke-test the Vercel Sandbox renderer against a real stored resume.yaml +
 * cover.md from the last tailor run — BEFORE wiring render into the graph.
 * Writes PDFs to ./tmp-render/ so you can open and eyeball them.
 *
 * Requires VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID in .env.local.
 *
 * dotenv -e .env.local -- tsx --conditions=react-server scripts/rerun-render.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { db } from "@hub/core/db";
import { supabase } from "@hub/core/supabase";
import { STORAGE_BUCKET } from "../packages/agent-jobhunt/src/manifest";
import {
  checkAts,
  disposeRenderSandbox,
  extractPdfText,
  getRenderer,
} from "../packages/agent-jobhunt/src/render";

async function download(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(path);
  if (error || !data) {
    throw new Error(`download ${path} failed: ${error?.message ?? "no data"}`);
  }
  return await data.text();
}

async function main() {
  const job = await db.job.findFirst({
    where: {
      resumeStoragePath: { not: null },
      coverStoragePath: { not: null },
    },
    orderBy: { tailoredAt: "desc" },
    select: {
      id: true,
      title: true,
      company: true,
      resumeStoragePath: true,
      coverStoragePath: true,
      tailorDetails: true,
    },
  });

  if (!job?.resumeStoragePath || !job.coverStoragePath) {
    console.error(
      "No tailored job with a stored resume.yaml/cover.md found. Run the tailor step first.",
    );
    process.exit(1);
  }

  // Reuse the language the tailor step decided (persisted in tailorDetails.plan)
  // so the smoke test typesets in the same language as the real run.
  const lang =
    (job.tailorDetails as { plan?: { outputLanguage?: string } } | null)?.plan
      ?.outputLanguage === "fr"
      ? "fr"
      : "en";

  console.log(`Rendering ${job.id} (${job.title} @ ${job.company}) lang=${lang}`);
  const resumeYaml = await download(job.resumeStoragePath);
  const coverMd = await download(job.coverStoragePath);

  const t0 = Date.now();
  const { resumePdf, coverPdf } = await getRenderer().render({
    jobId: job.id,
    resumeYaml,
    coverMd,
    lang,
  });
  console.log(
    `Rendered in ${Date.now() - t0}ms — resume ${resumePdf.length}B, cover ${coverPdf.length}B`,
  );

  const ats = checkAts(await extractPdfText(resumePdf));
  console.log("ATS:", JSON.stringify(ats));

  const outDir = "./tmp-render";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/resume.pdf`, resumePdf);
  writeFileSync(`${outDir}/cover.pdf`, coverPdf);
  console.log(`Wrote ${outDir}/resume.pdf and ${outDir}/cover.pdf — open to verify.`);

  await disposeRenderSandbox();
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("crashed:", e);
  await disposeRenderSandbox().catch(() => {});
  process.exit(1);
});
