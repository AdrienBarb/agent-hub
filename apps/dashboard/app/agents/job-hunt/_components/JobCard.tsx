"use client";

import type { CSSProperties } from "react";
import { ArtifactLinks } from "./ArtifactLinks";
import {
  boardLabel,
  formatScore,
  scoreColor,
  scorePct,
  scoreTier,
  type JobView,
} from "./types";

type Props = {
  job: JobView;
  pending: boolean;
  dismissing: "applied" | "rejected" | null;
  onApply: () => void;
  onSkip: () => void;
};

const TIER_LABEL: Record<string, string> = {
  strong: "Strong fit",
  good: "Good fit",
  weak: "Weak fit",
};

export function JobCard({ job, pending, dismissing, onApply, onSkip }: Props) {
  const tier = scoreTier(job.fitScore);
  const ring = scoreColor(job.fitScore);
  const meta = [job.company, job.city].filter(Boolean).join(" · ");

  return (
    <article
      className={`jh-card${dismissing ? " jh-card--out" : ""}`}
      data-tier={tier}
      style={{ "--ring": ring } as CSSProperties}
    >
      <div className="jh-card-head">
        <div
          className="jh-gauge"
          style={
            { "--pct": scorePct(job.fitScore), "--ring": ring } as CSSProperties
          }
          aria-label={`Fit score ${formatScore(job.fitScore)} out of 10`}
        >
          <div className="jh-gauge-inner">
            <span className="jh-gauge-num" style={{ color: ring }}>
              {formatScore(job.fitScore)}
            </span>
            <span className="jh-gauge-max">/10</span>
          </div>
        </div>

        <div className="jh-headtext">
          <span className="jh-tierlabel" style={{ color: ring }}>
            {TIER_LABEL[tier]}
          </span>
          <a
            className="jh-title"
            href={job.url}
            target="_blank"
            rel="noreferrer"
          >
            {job.title}
          </a>
          {meta ? <div className="jh-meta">{meta}</div> : null}
        </div>
      </div>

      {job.fitReasoning ? (
        <p className="jh-reason">{job.fitReasoning}</p>
      ) : null}

      <div className="jh-foot">
        <div className="jh-links">
          <a
            className="jh-link"
            href={job.url}
            target="_blank"
            rel="noreferrer"
          >
            {boardLabel(job.board)} ↗
          </a>
          <ArtifactLinks job={job} />
        </div>

        <div className="jh-actions">
          <button
            type="button"
            className="jh-btn jh-btn--skip"
            disabled={pending}
            onClick={onSkip}
          >
            {dismissing === "rejected" ? "Skipping…" : "Skip"}
          </button>
          <button
            type="button"
            className="jh-btn jh-btn--apply"
            disabled={pending}
            onClick={onApply}
          >
            {dismissing === "applied" ? "Applying…" : "Apply ✓"}
          </button>
        </div>
      </div>
    </article>
  );
}
