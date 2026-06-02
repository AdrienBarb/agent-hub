import "server-only";
import { env } from "@hub/core/env";
import { boardRegistry } from "../boards";
import type { ParsedJob } from "../boards/types";
import type { JobHuntStateType } from "../state";

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
    let droppedDup = 0;

    for (const job of jobs) {
      const dedupKey = `${job.board}::${job.slug}`;
      if (seenSlugs.has(dedupKey)) {
        droppedDup++;
        continue;
      }
      seenSlugs.add(dedupKey);

      parsed.push(job);
      kept++;
    }

    console.log(
      `[parse] ${listing.board} ${listing.url}: parsed=${jobs.length} kept=${kept} droppedDup=${droppedDup}`,
    );
  }

  if (env.JOBHUNT_MAX_JOBS && parsed.length > env.JOBHUNT_MAX_JOBS) {
    console.log(
      `[parse] JOBHUNT_MAX_JOBS=${env.JOBHUNT_MAX_JOBS} — truncating ${parsed.length} → ${env.JOBHUNT_MAX_JOBS}`,
    );
    parsed.length = env.JOBHUNT_MAX_JOBS;
  }

  return { parsedJobs: parsed };
}
