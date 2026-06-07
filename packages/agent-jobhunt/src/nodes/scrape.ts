import "server-only";
import Firecrawl from "@mendable/firecrawl-js";
import { env } from "@hub/core/env";
import type { JobHuntStateType, ScrapedListing } from "../state";
import { boardConfigs } from "../config";
import { scrapeLinkedinListings } from "../boards/linkedin";

const firecrawl = new Firecrawl({ apiKey: env.FIRECRAWL_API_KEY });

/**
 * Scrape every Firecrawl board's listing URLs (sequential, unchanged behaviour).
 * Returns the listings plus an attempted/succeeded tally that feeds the outage
 * guard — LinkedIn is deliberately NOT counted here (it's a separate, fail-soft
 * source whose failure must never abort the Firecrawl boards).
 */
async function scrapeFirecrawlBoards(
  boards: [string, (typeof boardConfigs)[string]][],
): Promise<{ listings: ScrapedListing[]; attempted: number; succeeded: number }> {
  const listings: ScrapedListing[] = [];
  let attempted = 0;
  let succeeded = 0;

  for (const [boardId, boardCfg] of boards) {
    for (const url of boardCfg.listing_urls) {
      attempted++;
      try {
        const res = await firecrawl.scrape(url, {
          formats: ["markdown"],
          onlyMainContent: boardCfg.firecrawl.onlyMainContent,
          waitFor: boardCfg.firecrawl.waitFor,
          timeout: boardCfg.firecrawl.timeout,
        });

        const md = (res as { markdown?: string }).markdown ?? "";
        listings.push({ board: boardId, url, markdown: md });
        succeeded++;
        console.log(`[scrape] ${boardId} ${url}: ${md.length} chars`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        console.error(`[scrape] ${boardId} ${url} failed: ${message}`);
      }
    }
  }

  return { listings, attempted, succeeded };
}

/** Scrape every Browserbase-sourced (LinkedIn) board — fail-soft, isolated from
 * the Firecrawl outage guard. */
async function scrapeLinkedinBoards(
  boards: [string, (typeof boardConfigs)[string]][],
): Promise<ScrapedListing[]> {
  const listings: ScrapedListing[] = [];
  for (const [boardId, boardCfg] of boards) {
    try {
      const got = await scrapeLinkedinListings(boardId, boardCfg);
      listings.push(...got);
      console.log(`[scrape] ${boardId}: ${got.length} listing page(s)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      console.error(`[scrape] ${boardId} failed (soft-skip): ${message}`);
    }
  }
  return listings;
}

export async function scrapeNode(
  _state: JobHuntStateType,
): Promise<Partial<JobHuntStateType>> {
  const entries = Object.entries(boardConfigs);
  const firecrawlBoards = entries.filter(([, c]) => c.source !== "linkedin");
  const linkedinBoards = entries.filter(([, c]) => c.source === "linkedin");

  // Run the two sources concurrently: LinkedIn's Browserbase pass is slower than
  // a Firecrawl listing fetch, so it shouldn't serialize behind (or block) the
  // Firecrawl boards.
  const [firecrawl, linkedinListings] = await Promise.all([
    scrapeFirecrawlBoards(firecrawlBoards),
    scrapeLinkedinBoards(linkedinBoards),
  ]);

  const scrapes = [...firecrawl.listings, ...linkedinListings];

  // Outage guard: ONLY a total Firecrawl failure aborts the run. A LinkedIn
  // outage is fail-soft (the board simply contributes no listings this run).
  if (firecrawl.attempted > 0 && firecrawl.succeeded === 0) {
    throw new Error(
      `scrape: 0/${firecrawl.attempted} Firecrawl listing URLs returned usable markdown — treating as outage`,
    );
  }

  return { scrapedListings: scrapes };
}
