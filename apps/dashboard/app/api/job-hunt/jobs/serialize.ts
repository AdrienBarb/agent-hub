import "server-only";

import { Prisma } from "@hub/core/prisma";
import type { JobView } from "@/lib/job-hunt/types";

// The columns the board needs. Kept here (next to the route) because the
// JobView mapping below is derived straight from it, so adding/removing a column
// can't leave the mapping stale.
export const jobSelect = {
  id: true,
  url: true,
  title: true,
  company: true,
  city: true,
  board: true,
  firstSeenAt: true,
  fitScore: true,
  fitReasoning: true,
  status: true,
  resumePdfStoragePath: true,
  coverPdfStoragePath: true,
  resumeStoragePath: true,
  coverStoragePath: true,
} as const;

type JobRow = Prisma.JobGetPayload<{ select: typeof jobSelect }>;

// Map a Prisma row into the JSON-safe shape the client renders: Decimal →
// number, Date → YYYY-MM-DD, and storage paths collapsed into the download
// `kind` each link should request (PDF preferred, source as fallback).
export function toJobView(j: JobRow): JobView {
  return {
    id: j.id,
    title: j.title,
    company: j.company,
    city: j.city,
    url: j.url,
    board: j.board,
    firstSeen: j.firstSeenAt.toISOString().slice(0, 10),
    fitScore: j.fitScore == null ? null : j.fitScore.toNumber(),
    fitReasoning: j.fitReasoning,
    status: j.status,
    resumeKind: j.resumePdfStoragePath
      ? "resume-pdf"
      : j.resumeStoragePath
        ? "resume"
        : null,
    coverKind: j.coverPdfStoragePath
      ? "cover-pdf"
      : j.coverStoragePath
        ? "cover"
        : null,
  };
}
