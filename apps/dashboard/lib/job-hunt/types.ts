// The job-hunt data contract shared across the network boundary: the API route
// produces these shapes, the axios fetchers type them, and the client renders
// them. Kept UI-free (no React, no presentation helpers) so both the server
// route handlers and client components can import it without leaking either way.

import type { JobStatus } from "@hub/core/prisma";
import type { Kind } from "@/app/api/job-hunt/artifact/kinds";

// Tie the download kinds back to the route's authoritative allow-list so a
// rename in kinds.ts is a compile error here, not a silent runtime 400.
export type ResumeKind = Extract<Kind, "resume-pdf" | "resume"> | null;
export type CoverKind = Extract<Kind, "cover-pdf" | "cover"> | null;

export type JobView = {
  id: string;
  title: string;
  company: string | null;
  city: string | null;
  url: string;
  board: string;
  firstSeen: string; // YYYY-MM-DD
  fitScore: number | null; // 1–10
  fitReasoning: string | null;
  status: JobStatus; // "tailored" | "applied" | "rejected" | …
  resumeKind: ResumeKind;
  coverKind: CoverKind;
};

// Statuses the dashboard is allowed to set on a job. "applied"/"rejected" are
// the Apply/Skip actions; "tailored" is Restore (moves a job back out of the
// Old-jobs list). The PATCH route rejects anything else — the client never gets
// to write an arbitrary JobStatus.
export const MARKABLE_STATUSES = ["applied", "rejected", "tailored"] as const;
export type MarkableStatus = (typeof MARKABLE_STATUSES)[number];

export function isMarkableStatus(value: unknown): value is MarkableStatus {
  return (
    typeof value === "string" &&
    (MARKABLE_STATUSES as readonly string[]).includes(value)
  );
}

// GET /api/job-hunt/jobs
export type JobsResponse = { active: JobView[]; old: JobView[] };

// GET /api/job-hunt/run/status — `running` is the polling signal (true while a
// run is pending or in flight). Dates are ISO strings (JSON-serialized).
export type RunStatusResponse = {
  running: boolean;
  status: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};
