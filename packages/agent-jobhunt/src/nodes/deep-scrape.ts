import "server-only";
import Firecrawl from "@mendable/firecrawl-js";
import { db } from "@hub/core/db";
import { env } from "@hub/core/env";
import type { JobHuntStateType } from "../state";

const CONCURRENCY = 5;
const MIN_MARKDOWN_CHARS = 1024;
const FIRECRAWL_TIMEOUT_MS = 60_000;
const OUTAGE_MIN_SAMPLE = 3;

const firecrawl = new Firecrawl({ apiKey: env.FIRECRAWL_API_KEY });

type ScrapeOutcome = "ok" | "thin" | "fetch-error" | "db-error";

async function scrapeOne(job: { id: string; url: string }): Promise<ScrapeOutcome> {
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
    return "fetch-error";
  }

  if (md.length < MIN_MARKDOWN_CHARS) {
    try {
      await db.job.update({ where: { id: job.id }, data: { rawMarkdown: "" } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      console.error(`[deep-scrape] ${job.id} thin-sentinel update failed: ${message}`);
    }
    console.warn(`[deep-scrape] ${job.id}: thin markdown (${md.length} chars), sentinel set`);
    return "thin";
  }

  try {
    await db.job.update({ where: { id: job.id }, data: { rawMarkdown: md } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error(`[deep-scrape] ${job.id} scrape ok but DB update failed: ${message}`);
    return "db-error";
  }

  console.log(`[deep-scrape] ${job.id}: ${md.length} chars`);
  return "ok";
}

export async function deepScrapeNode(
  state: JobHuntStateType,
): Promise<Partial<JobHuntStateType>> {
  const jobs = await db.job.findMany({
    where: { runId: state.runId, rawMarkdown: null },
    select: { id: true, url: true },
  });

  if (jobs.length === 0) {
    console.log("[deep-scrape] no jobs need JD scrape");
    return { deepScrapedCount: 0 };
  }

  let succeeded = 0;

  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const chunk = jobs.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(chunk.map(scrapeOne));
    for (const r of results) {
      if (r.status === "fulfilled" && r.value === "ok") succeeded++;
    }
  }

  if (jobs.length >= OUTAGE_MIN_SAMPLE && succeeded === 0) {
    throw new Error(
      `deep-scrape: 0/${jobs.length} JD scrapes succeeded — treating as outage`,
    );
  }

  console.log(
    `[deep-scrape] succeeded=${succeeded} failed=${jobs.length - succeeded} attempted=${jobs.length}`,
  );
  return { deepScrapedCount: succeeded };
}
