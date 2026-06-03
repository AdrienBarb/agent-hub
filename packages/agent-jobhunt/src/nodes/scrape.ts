import "server-only";
import Firecrawl from "@mendable/firecrawl-js";
import { env } from "@hub/core/env";
import type { JobHuntStateType, ScrapedListing } from "../state";
import { boardConfigs } from "../config";

const MIN_MARKDOWN_CHARS = 1024;

const firecrawl = new Firecrawl({ apiKey: env.FIRECRAWL_API_KEY });

export async function scrapeNode(
  _state: JobHuntStateType,
): Promise<Partial<JobHuntStateType>> {
  const scrapes: ScrapedListing[] = [];
  let attempted = 0;

  for (const [boardId, boardCfg] of Object.entries(boardConfigs)) {
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
        if (md.length < MIN_MARKDOWN_CHARS) {
          console.warn(`[scrape] ${boardId} ${url}: thin markdown (${md.length} chars), skipping`);
          continue;
        }

        scrapes.push({ board: boardId, url, markdown: md });
        console.log(`[scrape] ${boardId} ${url}: ${md.length} chars`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        console.error(`[scrape] ${boardId} ${url} failed: ${message}`);
      }
    }
  }

  if (attempted > 0 && scrapes.length === 0) {
    throw new Error(
      `scrape: 0/${attempted} listing URLs returned usable markdown — treating as outage`,
    );
  }

  return { scrapedListings: scrapes };
}
