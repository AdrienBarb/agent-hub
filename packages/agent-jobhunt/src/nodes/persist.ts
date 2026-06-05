import "server-only";
import { db } from "@hub/core/db";
import type { JobHuntStateType } from "../state";

function isSafeUrl(url: string): boolean {
  return /^https:\/\//i.test(url);
}

export async function persistNode(
  state: JobHuntStateType,
): Promise<Partial<JobHuntStateType>> {
  // Filter out unsafe URLs at the persist boundary (defense in depth).
  const safeJobs = state.parsedJobs.filter((j) => {
    if (!isSafeUrl(j.url)) {
      console.warn(`[persist] dropping job with unsafe URL: ${j.board}/${j.slug} → ${j.url}`);
      return false;
    }
    return true;
  });
  if (safeJobs.length === 0) {
    return { persistedCount: 0 };
  }

  let upserted = 0;

  for (const job of safeJobs) {
    // Upsert keyed on the unique (board, slug) — race-safe across concurrent
    // cron + manual runs, and idempotent on re-listings (refreshes lastSeenAt).
    // The unique index is the dedup; downstream re-processing is gated by Job
    // status (new → evaluated → tailored), so re-upserting a known job is cheap
    // and never re-scrapes or re-evaluates it.
    await db.job.upsert({
      where: { board_slug: { board: job.board, slug: job.slug } },
      create: {
        board: job.board,
        slug: job.slug,
        url: job.url,
        title: job.title,
        company: job.company,
        city: job.city,
        runId: state.runId,
      },
      update: {
        lastSeenAt: new Date(),
        title: job.title,
        company: job.company,
        city: job.city,
        url: job.url,
        runId: state.runId,
      },
    });
    upserted++;
  }

  console.log(`[persist] upserted=${upserted}`);
  return { persistedCount: upserted };
}
