import "server-only";
import Firecrawl from "@mendable/firecrawl-js";
import { env } from "@hub/core/env";
import type { JobHuntStateType, RawScrape } from "../state";
import config from "../../config.json" with { type: "json" };

const firecrawl = new Firecrawl({ apiKey: env.FIRECRAWL_API_KEY });

export async function scrapeNode(
  _state: JobHuntStateType,
): Promise<Partial<JobHuntStateType>> {
  const scrapes: RawScrape[] = [];

  for (const [boardId, boardCfg] of Object.entries(config.boards)) {
    for (const url of boardCfg.listing_urls) {
      try {
        const res = await firecrawl.scrape(url, {
          formats: ["markdown"],
          onlyMainContent: boardCfg.firecrawl.onlyMainContent,
          waitFor: boardCfg.firecrawl.waitFor,
        });

        const md = (res as { markdown?: string }).markdown ?? "";
        if (md.length < 1024) {
          console.warn(`[scrape] ${boardId} ${url}: thin markdown (${md.length}B), skipping`);
          continue;
        }

        scrapes.push({ board: boardId, url, markdown: md });
        console.log(`[scrape] ${boardId} ${url}: ${md.length}B`);
      } catch (err) {
        console.error(`[scrape] ${boardId} ${url} failed:`, err);
      }
    }
  }

  return { rawScrapes: scrapes };
}
