import "server-only";
import { db } from "@hub/core/db";
import type { JobHuntStateType } from "../state";

const ZURICH = "Europe/Zurich";

function zurichDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZURICH,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isSafeUrl(url: string): boolean {
  return /^https:\/\//i.test(url);
}

export async function persistNode(
  state: JobHuntStateType,
): Promise<Partial<JobHuntStateType>> {
  const today = zurichDay(new Date());

  // Filter out unsafe URLs at the persist boundary (defense in depth).
  const safeJobs = state.parsedJobs.filter((j) => {
    if (!isSafeUrl(j.url)) {
      console.warn(`[persist] dropping job with unsafe URL: ${j.board}/${j.slug} → ${j.url}`);
      return false;
    }
    return true;
  });
  if (safeJobs.length === 0) {
    return { persistedCount: 0, skippedCount: 0 };
  }

  // Batch lookup: which (board, slug) pairs already exist?
  const existing = await db.job.findMany({
    where: {
      OR: safeJobs.map((j) => ({ board: j.board, slug: j.slug })),
    },
    select: { id: true, board: true, slug: true, lastSeenAt: true },
  });
  const existingMap = new Map(existing.map((r) => [`${r.board}::${r.slug}`, r]));

  let upserted = 0;
  let skipped = 0;

  for (const job of safeJobs) {
    const key = `${job.board}::${job.slug}`;
    const prior = existingMap.get(key);

    if (prior && zurichDay(prior.lastSeenAt) === today) {
      skipped++;
      continue;
    }

    // Upsert is race-safe across concurrent cron + manual runs.
    await db.job.upsert({
      where: { board_slug: { board: job.board, slug: job.slug } },
      create: {
        board: job.board,
        slug: job.slug,
        url: job.url,
        title: job.title,
        company: job.company,
        city: job.city,
        salary: job.salary,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        tech: job.tech,
        runId: state.runId,
      },
      update: {
        lastSeenAt: new Date(),
        title: job.title,
        company: job.company,
        city: job.city,
        salary: job.salary,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        tech: job.tech,
        url: job.url,
        runId: state.runId,
      },
    });
    upserted++;
  }

  console.log(`[persist] upserted=${upserted} skipped(seen-today)=${skipped}`);
  return { persistedCount: upserted, skippedCount: skipped };
}
