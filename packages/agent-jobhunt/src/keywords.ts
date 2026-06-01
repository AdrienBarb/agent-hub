import type { ParsedJob } from "./boards/types";

/**
 * Quick keyword score (0..n+0.5*m) based on title + tech + company.
 * Ported from /job-hunt skill scripts/sync-jobs.ts.
 */
export function scoreJob(
  job: ParsedJob,
  must: string[],
  bonus: string[],
): number {
  const haystack = (
    job.title +
    " " +
    job.tech.join(" ") +
    " " +
    (job.company ?? "")
  ).toLowerCase();
  let s = 0;
  for (const k of must) if (haystack.includes(k.toLowerCase())) s += 1;
  for (const k of bonus) if (haystack.includes(k.toLowerCase())) s += 0.5;
  return s;
}
