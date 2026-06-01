import "server-only";
import { boardRegistry } from "../boards";
import { passesFilters } from "../filters";
import { scoreJob } from "../keywords";
import type { ParsedJob } from "../boards/types";
import type { JobHuntStateType } from "../state";
import config from "../../config.json" with { type: "json" };

const MIN_KEYWORD_SCORE = 1;

export async function parseNode(
  state: JobHuntStateType,
): Promise<Partial<JobHuntStateType>> {
  const parsed: ParsedJob[] = [];
  const seenSlugs = new Set<string>();

  for (const listing of state.scrapedListings) {
    const adapter = boardRegistry[listing.board];
    if (!adapter) {
      console.warn(`[parse] no adapter for board "${listing.board}"`);
      continue;
    }

    const jobs = adapter.parse(listing.markdown);
    let kept = 0;
    let droppedFilter = 0;
    let droppedKeyword = 0;
    let droppedDup = 0;

    for (const job of jobs) {
      const dedupKey = `${job.board}::${job.slug}`;
      if (seenSlugs.has(dedupKey)) {
        droppedDup++;
        continue;
      }
      seenSlugs.add(dedupKey);

      const filterResult = passesFilters(job, config.filters);
      if (!filterResult.ok) {
        droppedFilter++;
        continue;
      }

      const kwScore = scoreJob(
        job,
        config.keywords.must_match,
        config.keywords.bonus,
      );
      if (kwScore < MIN_KEYWORD_SCORE) {
        droppedKeyword++;
        continue;
      }

      parsed.push(job);
      kept++;
    }

    console.log(
      `[parse] ${listing.board} ${listing.url}: parsed=${jobs.length} kept=${kept} dropped(filter/kw/dup)=${droppedFilter}/${droppedKeyword}/${droppedDup}`,
    );
  }

  return { parsedJobs: parsed };
}
