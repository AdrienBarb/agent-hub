/**
 * Re-run the REAL tailor subgraph end-to-end on the evaluated jobs in the DB,
 * with the native-structured-output fix. Exercises plan -> draft-resume ->
 * draft-cover -> ats-check -> (revise?) -> persist (Supabase Storage + DB).
 *
 * dotenv -e .env.local -- tsx --conditions=react-server scripts/rerun-tailor.ts
 */
import { db } from "@hub/core/db";
import { supabase } from "@hub/core/supabase";
import { setupCheckpointer } from "../packages/agent-jobhunt/src/checkpointer";
import { tailorSubgraph } from "../packages/agent-jobhunt/src/tailor/graph";
import { STORAGE_BUCKET } from "../packages/agent-jobhunt/src/manifest";

async function main() {
  await setupCheckpointer();
  const stamp = Date.now();

  const jobs = await db.job.findMany({
    where: { status: "evaluated", rawMarkdown: { not: null } },
    select: { id: true, runId: true, rawMarkdown: true, fitDetails: true, title: true, company: true },
  });
  console.log(`Found ${jobs.length} evaluated job(s) to tailor.\n`);

  for (const job of jobs) {
    console.log(`--- tailoring ${job.id} (${job.title} @ ${job.company}) ---`);
    try {
      const result = await tailorSubgraph.invoke(
        { jobId: job.id, rawMarkdown: job.rawMarkdown, fitDetails: job.fitDetails },
        { configurable: { thread_id: `${job.runId}::${job.id}::tailor-fix-${stamp}` } },
      );
      console.log(
        `  finalStatus=${result.finalStatus} | resume roles=${result.draftResume?.experience.length} skills=${result.draftResume?.skills.length} | cover chars=${result.draftCover?.markdown.length} | ats.ok=${result.atsCheckResult?.ok}`,
      );
    } catch (err) {
      console.error(`  FAILED: ${(err as Error).message}`);
    }
  }

  const after = await db.job.findMany({
    where: { id: { in: jobs.map((j) => j.id) } },
    select: { id: true, runId: true, status: true, tailoredAt: true, resumeStoragePath: true },
  });
  console.log("\n=== DB state after tailoring ===");
  for (const j of after) {
    console.log(`${j.id} status=${j.status} tailoredAt=${j.tailoredAt ? "set" : "null"} resume=${j.resumeStoragePath ?? "—"}`);
  }

  // Download one stored resume.yaml and show its skills section to prove the
  // array->map conversion produced a populated, well-formed map.
  const sample = after.find((j) => j.resumeStoragePath);
  if (sample?.resumeStoragePath) {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(sample.resumeStoragePath);
    if (error) {
      console.log("\n(could not download stored resume:", error.message, ")");
    } else {
      const text = await data.text();
      const skillsIdx = text.indexOf("skills:");
      console.log(`\n=== stored ${sample.resumeStoragePath} (skills section) ===`);
      console.log(skillsIdx >= 0 ? text.slice(skillsIdx, skillsIdx + 600) : text.slice(0, 400));
    }
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error("crashed:", e);
  process.exit(1);
});
