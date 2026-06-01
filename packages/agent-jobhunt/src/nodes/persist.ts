import "server-only";
import { db } from "@hub/core/db";
import type { JobHuntStateType } from "../state";

function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export async function persistNode(
  state: JobHuntStateType,
): Promise<Partial<JobHuntStateType>> {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const job of state.parsedJobs) {
    const existing = await db.job.findUnique({
      where: { board_slug: { board: job.board, slug: job.slug } },
      select: { id: true, lastSeenAt: true },
    });

    if (existing && isToday(existing.lastSeenAt)) {
      skipped++;
      continue;
    }

    if (existing) {
      await db.job.update({
        where: { id: existing.id },
        data: {
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
      updated++;
    } else {
      await db.job.create({
        data: {
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
      });
      inserted++;
    }
  }

  console.log(
    `[persist] inserted=${inserted} updated=${updated} skipped(seen-today)=${skipped}`,
  );
  return { persistedCount: inserted + updated, skippedCount: skipped };
}
