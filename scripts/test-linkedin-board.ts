/**
 * Dry-run the LinkedIn board end-to-end WITHOUT the graph (no DB, no LLM, no
 * Inngest). Exercises the real integration path:
 *   config.json → scrapeLinkedinListings (Browserbase guest search)
 *              → linkedin.parse (cards → ParsedJob[], deduped across pages)
 *              → fetchLinkedinJd (guest detail → plain-text JD) for a sample
 *
 *   pnpm exec dotenv -e .env.local -- \
 *     env BROWSERBASE_PROJECT_ID=<correct-id> tsx scripts/test-linkedin-board.ts
 *
 * Prints: pages fetched, unique jobs, a full job table, and a JD sample so you
 * can see how many jobs and what KIND of jobs a real run would ingest.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { boardConfigs } from "../packages/agent-jobhunt/src/config";
import {
  linkedin,
  scrapeLinkedinListings,
  fetchLinkedinJd,
  disposeLinkedinSession,
  linkedinConfigured,
} from "../packages/agent-jobhunt/src/boards/linkedin";
import type { ParsedJob } from "../packages/agent-jobhunt/src/boards/types";

const OUT_DIR = "./tmp-linkedin-board";
const JD_SAMPLE = 3; // how many JDs to actually fetch (keeps Browserbase time low)

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  if (!linkedinConfigured()) {
    console.error(
      "✗ BROWSERBASE_API_KEY / BROWSERBASE_PROJECT_ID not set — cannot run. " +
        "Pass the correct project id inline (see header).",
    );
    process.exit(1);
  }

  const cfg = boardConfigs.linkedin;
  if (!cfg?.linkedin) {
    console.error("✗ no `linkedin` board in config.json");
    process.exit(1);
  }

  const { searches, fTPR, maxPages } = cfg.linkedin;
  console.log(
    `[config] ${searches.length} searches × ${maxPages} page(s), f_TPR=${fTPR}\n` +
      searches.map((s) => `   • "${s.keywords}" (geoId ${s.geoId})`).join("\n"),
  );
  console.log(
    `[config] expected listing fetches = ${searches.length} × ${maxPages} = ${searches.length * maxPages}\n`,
  );

  try {
    // ---- Phase A: listings (Browserbase guest search) ----
    const listings = await scrapeLinkedinListings("linkedin", cfg);
    console.log(`\n[A] guest-search pages returned: ${listings.length}`);

    // ---- Phase B: parse + dedupe across pages (mirrors parseNode's board::slug) ----
    const bySlug = new Map<string, ParsedJob>();
    let rawCards = 0;
    for (const l of listings) {
      const jobs = linkedin.parse(l.markdown);
      rawCards += jobs.length;
      for (const j of jobs) if (!bySlug.has(j.slug)) bySlug.set(j.slug, j);
    }
    const jobs = [...bySlug.values()];

    console.log(`[B] raw cards parsed:   ${rawCards}`);
    console.log(`[B] UNIQUE jobs:        ${jobs.length}  (after intra-board dedupe)`);
    const withCompany = jobs.filter((j) => j.company).length;
    const withCity = jobs.filter((j) => j.city).length;
    const badUrl = jobs.filter(
      (j) => !/^https:\/\/www\.linkedin\.com\/jobs\/view\/\d+$/.test(j.url),
    );
    console.log(`[B] with company:       ${withCompany}/${jobs.length}`);
    console.log(`[B] with city:          ${withCity}/${jobs.length}  (null = country-level/unknown)`);
    console.log(`[B] malformed urls:     ${badUrl.length}`);

    console.log(`\n=== JOBS (${jobs.length}) ===`);
    jobs.forEach((j, i) => {
      console.log(
        `${String(i + 1).padStart(2)}. ${j.title}\n     ${j.company ?? "—"}  ·  ${j.city ?? "—"}\n     ${j.url}`,
      );
    });
    writeFileSync(`${OUT_DIR}/jobs.json`, JSON.stringify(jobs, null, 2));

    if (jobs.length === 0) {
      console.error("\n✗ 0 jobs parsed — aborting before JD sample");
      return;
    }

    // ---- Phase C: JD fetch sample (guest detail → plain text) ----
    const sample = jobs.slice(0, JD_SAMPLE);
    console.log(`\n=== JD SAMPLE (${sample.length} of ${jobs.length}) ===`);
    for (const j of sample) {
      const jd = await fetchLinkedinJd(j.slug);
      const safe = j.slug.replace(/[^a-z0-9]/gi, "_");
      if (jd) {
        writeFileSync(`${OUT_DIR}/jd-${safe}.txt`, jd);
        console.log(
          `✓ ${j.slug} (${j.title}): ${jd.length} chars → ${OUT_DIR}/jd-${safe}.txt`,
        );
        console.log(`    ${jd.replace(/\s+/g, " ").slice(0, 160)}…`);
      } else {
        console.log(`✗ ${j.slug} (${j.title}): JD fetch returned null`);
      }
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`pages fetched : ${listings.length}`);
    console.log(`unique jobs   : ${jobs.length}  (this is roughly how many a daily run ingests)`);
    console.log(`artifacts     : ${OUT_DIR}/jobs.json + jd-*.txt`);
  } finally {
    await disposeLinkedinSession();
    console.log("[browserbase] session disposed");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
