/**
 * Smoke-test the swissdevjobs.ch adapter against LIVE Firecrawl data.
 *
 *   dotenv -e .env.local -- tsx scripts/test-swissdevjobs.ts
 *
 * Phase A: scrape listing (or reuse cached ./tmp-swissdevjobs/listing.md) → run
 *          the REAL adapter → print parsed jobs + field-coverage stats.
 * Phase B: deep-scrape 3 of the parsed job URLs (the same options the graph's
 *          deep-scrape node uses) → confirm each JD returns usable markdown.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Firecrawl from "@mendable/firecrawl-js";
import { swissdevjobs } from "../packages/agent-jobhunt/src/boards/swissdevjobs";

const LISTING_URL = "https://swissdevjobs.ch/fr/jobs/JavaScript/all";
const OUT_DIR = "./tmp-swissdevjobs";
const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY! });

async function getListingMd(): Promise<string> {
  const cached = `${OUT_DIR}/listing.md`;
  if (existsSync(cached)) {
    console.log(`[listing] reusing cached ${cached}`);
    return readFileSync(cached, "utf8");
  }
  console.log(`[listing] scraping ${LISTING_URL} …`);
  const res = await firecrawl.scrape(LISTING_URL, {
    formats: ["markdown"],
    onlyMainContent: true,
    waitFor: 5000,
    timeout: 60_000,
  });
  const md = (res as { markdown?: string }).markdown ?? "";
  writeFileSync(cached, md);
  return md;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const md = await getListingMd();

  // ---- Phase A: parse ----
  const jobs = swissdevjobs.parse(md);
  const withCompany = jobs.filter((j) => j.company).length;
  const withCity = jobs.filter((j) => j.city).length;
  const badUrl = jobs.filter((j) => !/^https:\/\/swissdevjobs\.ch\/jobs\//.test(j.url));
  const dupSlugs = jobs.length - new Set(jobs.map((j) => j.slug)).size;

  console.log(`\n=== PARSE RESULT ===`);
  console.log(`jobs parsed      : ${jobs.length}`);
  console.log(`with company     : ${withCompany}/${jobs.length}`);
  console.log(`with city        : ${withCity}/${jobs.length}`);
  console.log(`duplicate slugs  : ${dupSlugs}`);
  console.log(`malformed urls   : ${badUrl.length}`);
  console.log(`\n=== first 12 jobs ===`);
  for (const j of jobs.slice(0, 12)) {
    console.log(
      `• ${j.title}\n    company=${j.company ?? "—"}  city=${j.city ?? "—"}\n    ${j.url}`,
    );
  }
  writeFileSync(`${OUT_DIR}/parsed.json`, JSON.stringify(jobs, null, 2));

  if (jobs.length === 0) {
    console.error("\n✗ adapter parsed 0 jobs — aborting before deep-scrape");
    process.exit(1);
  }

  // ---- Phase B: deep-scrape 3 JD pages ----
  const sample = jobs.slice(0, 3);
  console.log(`\n=== DEEP-SCRAPE ${sample.length} JD pages (onlyMainContent, waitFor 3000) ===`);
  for (const j of sample) {
    try {
      const res = await firecrawl.scrape(j.url, {
        formats: ["markdown"],
        onlyMainContent: true,
        waitFor: 3000,
        timeout: 60_000,
      });
      const jd = (res as { markdown?: string }).markdown ?? "";
      const safe = j.slug.replace(/[^a-z0-9-]/gi, "_").slice(0, 60);
      writeFileSync(`${OUT_DIR}/jd-${safe}.md`, jd);
      const looksReal = jd.length > 500;
      console.log(
        `${looksReal ? "✓" : "✗"} ${j.slug}: ${jd.length} chars → ${OUT_DIR}/jd-${safe}.md`,
      );
      console.log(`    head: ${jd.replace(/\s+/g, " ").slice(0, 140)}…`);
    } catch (e) {
      console.error(`✗ ${j.slug} scrape failed: ${e instanceof Error ? e.message : e}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
