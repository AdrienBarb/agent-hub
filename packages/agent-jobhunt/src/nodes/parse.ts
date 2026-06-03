import "server-only";
import { env } from "@hub/core/env";
import { boardRegistry } from "../boards";
import type { ParsedJob } from "../boards/types";
import type { JobHuntStateType } from "../state";

export async function parseNode(
  state: JobHuntStateType,
): Promise<Partial<JobHuntStateType>> {
  // Group kept jobs per board (preserving first-seen order within each board) so
  // we can round-robin across boards before the JOBHUNT_MAX_JOBS cap. A flat
  // board-then-URL list would let the cap silently discard whole later boards.
  const byBoard = new Map<string, ParsedJob[]>();
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

      const bucket = byBoard.get(job.board);
      if (bucket) bucket.push(job);
      else byBoard.set(job.board, [job]);
      kept++;
    }

    console.log(
      `[parse] ${listing.board} ${listing.url}: parsed=${jobs.length} kept=${kept} droppedDup=${droppedDup}`,
    );
  }

  // Round-robin interleave: take index 0 from every board, then index 1, etc.,
  // so the cap below samples every board fairly instead of filling up from the
  // first board in config order.
  const lists = [...byBoard.values()];
  const maxLen = lists.reduce((m, l) => Math.max(m, l.length), 0);
  const parsed: ParsedJob[] = [];
  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) {
      const job = list[i];
      if (job !== undefined) parsed.push(job);
    }
  }

  if (env.JOBHUNT_MAX_JOBS && parsed.length > env.JOBHUNT_MAX_JOBS) {
    console.log(
      `[parse] JOBHUNT_MAX_JOBS=${env.JOBHUNT_MAX_JOBS} — truncating ${parsed.length} → ${env.JOBHUNT_MAX_JOBS} (round-robin across ${lists.length} board(s))`,
    );
    parsed.length = env.JOBHUNT_MAX_JOBS;
  }

  return { parsedJobs: parsed };
}
