import "server-only";
import Firecrawl from "@mendable/firecrawl-js";
import { db } from "@hub/core/db";
import { env } from "@hub/core/env";
import { fetchLinkedinJd, disposeLinkedinSession } from "../boards/linkedin";
import { summarizeScrapeErrors, makeWarning, type RunWarning } from "../warnings";

const CONCURRENCY = 5;
// LinkedIn JDs share one Browserbase session and `fetchHtml` opens a fresh page
// per call, so a few concurrent tabs are safe — kept low (3) to stay gentle on
// the free-tier session and bound the per-tab challenge risk. This is what keeps
// the deep-scrape step under the 800s ceiling on a big LinkedIn day: 44 strictly
// sequential fetches at up to GOTO_TIMEOUT_MS (45s) each could alone exceed it.
const LINKEDIN_CONCURRENCY = 3;
const FIRECRAWL_TIMEOUT_MS = 60_000;
const OUTAGE_MIN_SAMPLE = 3;

const firecrawl = new Firecrawl({ apiKey: env.FIRECRAWL_API_KEY });

type ScrapeOutcome = "ok" | "fetch-error" | "db-error";

type FirecrawlResult = { board: string; outcome: ScrapeOutcome; error?: unknown };

type JobRow = { id: string; url: string; board: string; slug: string };

async function writeRawMarkdown(id: string, md: string): Promise<ScrapeOutcome> {
  try {
    await db.job.update({ where: { id }, data: { rawMarkdown: md } });
    return "ok";
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error(`[deep-scrape] ${id} scrape ok but DB update failed: ${message}`);
    return "db-error";
  }
}

/** Firecrawl boards: fetch the JD page at job.url (unchanged behaviour). */
async function scrapeFirecrawlOne(job: JobRow): Promise<FirecrawlResult> {
  let md: string;
  try {
    const res = await firecrawl.scrape(job.url, {
      formats: ["markdown"],
      onlyMainContent: true,
      waitFor: 3000,
      timeout: FIRECRAWL_TIMEOUT_MS,
    });
    md = (res as { markdown?: string }).markdown ?? "";
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error(`[deep-scrape] ${job.id} fetch failed: ${message}`);
    return { board: job.board, outcome: "fetch-error", error: err };
  }
  const outcome = await writeRawMarkdown(job.id, md);
  if (outcome === "ok") console.log(`[deep-scrape] ${job.id}: ${md.length} chars`);
  return { board: job.board, outcome };
}

/**
 * LinkedIn rows: fetch the JD from the guest DETAIL endpoint via Browserbase
 * (NOT Firecrawl — job.url is the human apply link, which is login-gated). A
 * null result (miss/too-short) leaves rawMarkdown null, identical to a Firecrawl
 * miss: the row is simply excluded from evaluation.
 */
async function scrapeLinkedinOne(job: JobRow): Promise<ScrapeOutcome> {
  const jd = await fetchLinkedinJd(job.slug);
  if (jd === null) return "fetch-error";
  const outcome = await writeRawMarkdown(job.id, jd);
  if (outcome === "ok") console.log(`[deep-scrape] ${job.id} (linkedin): ${jd.length} chars`);
  return outcome;
}

export async function deepScrapeNode(input: {
  runId: string;
}): Promise<{ deepScrapedCount: number; warnings: RunWarning[] }> {
  const jobs = (await db.job.findMany({
    where: { runId: input.runId, rawMarkdown: null },
    select: { id: true, url: true, board: true, slug: true },
  })) as JobRow[];

  if (jobs.length === 0) {
    console.log("[deep-scrape] no jobs need JD scrape");
    return { deepScrapedCount: 0, warnings: [] };
  }

  const linkedinJobs = jobs.filter((j) => j.board === "linkedin");
  const firecrawlJobs = jobs.filter((j) => j.board !== "linkedin");

  try {
    let firecrawlSucceeded = 0;
    const fetchErrorsByBoard = new Map<string, unknown[]>();
    const dbErrorsByBoard = new Map<string, number>();
    for (let i = 0; i < firecrawlJobs.length; i += CONCURRENCY) {
      const chunk = firecrawlJobs.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(chunk.map(scrapeFirecrawlOne));
      for (const r of results) {
        if (r.status !== "fulfilled") continue;
        const { board, outcome, error } = r.value;
        if (outcome === "ok") {
          firecrawlSucceeded++;
        } else if (outcome === "db-error") {
          // Scrape succeeded but the DB write failed — a different root cause
          // than a page-fetch fault, so it gets its own warning kind.
          dbErrorsByBoard.set(board, (dbErrorsByBoard.get(board) ?? 0) + 1);
        } else {
          const arr = fetchErrorsByBoard.get(board) ?? [];
          arr.push(error);
          fetchErrorsByBoard.set(board, arr);
        }
      }
    }

    // LinkedIn JDs share one Browserbase session — fetched in small concurrent
    // batches (LINKEDIN_CONCURRENCY) rather than strictly sequentially, so the
    // 44-fetch worst case (each up to 45s) can't alone blow this step's 800s
    // budget. `fetchHtml` opens a fresh page per call, so the batch is tab-safe.
    let linkedinSucceeded = 0;
    for (let i = 0; i < linkedinJobs.length; i += LINKEDIN_CONCURRENCY) {
      const chunk = linkedinJobs.slice(i, i + LINKEDIN_CONCURRENCY);
      const results = await Promise.allSettled(chunk.map(scrapeLinkedinOne));
      for (const r of results) {
        if (r.status === "fulfilled" && r.value === "ok") linkedinSucceeded++;
      }
    }

    // Outage guard counts ONLY Firecrawl rows — a LinkedIn outage is fail-soft
    // and must not abort a run whose Firecrawl boards are healthy.
    if (firecrawlJobs.length >= OUTAGE_MIN_SAMPLE && firecrawlSucceeded === 0) {
      throw new Error(
        `deep-scrape: 0/${firecrawlJobs.length} Firecrawl JD scrapes succeeded — treating as outage`,
      );
    }

    const succeeded = firecrawlSucceeded + linkedinSucceeded;
    console.log(
      `[deep-scrape] succeeded=${succeeded} (firecrawl=${firecrawlSucceeded}/${firecrawlJobs.length}, linkedin=${linkedinSucceeded}/${linkedinJobs.length})`,
    );
    // LinkedIn JD misses (null) are normal soft misses (too-short / 404), not
    // warned. A Browserbase quota error would already have surfaced in the
    // listing scrape (shared session), so only Firecrawl JD errors are batched.
    // "jd" detail keeps these distinct from the listing phase's same-kind
    // (402/429) warnings in the keyed reducer.
    const warnings: RunWarning[] = [
      ...[...fetchErrorsByBoard.entries()].flatMap(([board, errs]) =>
        summarizeScrapeErrors(board, errs, "deepscrape_failed", "jd"),
      ),
      ...[...dbErrorsByBoard.entries()].map(([board, count]) =>
        makeWarning("db_write_failed", board, { count }),
      ),
    ];
    return { deepScrapedCount: succeeded, warnings };
  } finally {
    // Happy-path teardown: nothing downstream needs the Browserbase session, so
    // free the free-tier browser-hour ASAP. Idempotent — inngest's catch also
    // calls it as a crash safety-net.
    await disposeLinkedinSession();
  }
}
