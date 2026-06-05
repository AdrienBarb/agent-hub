// Plain (no "server-only") module so client components can import the shared
// shape + presentation helpers. The server (page.tsx) maps Prisma rows into
// JobView, converting the Decimal fitScore to a number and resolving which
// artifact `kind` each download link should request.

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
  status: string; // JobStatus value ("tailored" | "applied" | "rejected" | …)
  resumeKind: ResumeKind;
  coverKind: CoverKind;
};

export type ScoreTier = "strong" | "good" | "weak";

// Scores are reconciled onto a 1–10 scale. Three bands keep the colour language
// legible at a glance.
export function scoreTier(score: number | null): ScoreTier {
  if (score == null) return "weak";
  if (score >= 8) return "strong";
  if (score >= 6.5) return "good";
  return "weak";
}

const TIER_COLOR: Record<ScoreTier, string> = {
  strong: "#34d399", // emerald
  good: "#fbbf24", // amber
  weak: "#fb7185", // rose
};

export function scoreColor(score: number | null): string {
  return TIER_COLOR[scoreTier(score)];
}

export function formatScore(score: number | null): string {
  if (score == null) return "—";
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

// Percent of the gauge ring to fill (0–100) for a 1–10 score.
export function scorePct(score: number | null): number {
  if (score == null) return 0;
  return Math.max(0, Math.min(100, Math.round((score / 10) * 100)));
}

const BOARD_LABELS: Record<string, string> = {
  swissdevjobs: "SwissDevJobs",
  "swissdevjobs.ch": "SwissDevJobs",
  jobup: "jobup.ch",
  "jobup.ch": "jobup.ch",
  jobs: "jobs.ch",
  jobsch: "jobs.ch",
  "jobs.ch": "jobs.ch",
};

export function boardLabel(board: string): string {
  return (
    BOARD_LABELS[board.toLowerCase()] ??
    board.charAt(0).toUpperCase() + board.slice(1)
  );
}

export function artifactHref(jobId: string, kind: Kind): string {
  return `/api/job-hunt/artifact?jobId=${encodeURIComponent(jobId)}&kind=${encodeURIComponent(kind)}`;
}
