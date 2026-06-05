"use client";

import type { CSSProperties } from "react";
import { ArtifactLinks } from "./ArtifactLinks";
import { formatScore, scoreColor, type JobView } from "./types";

type Props = {
  job: JobView;
  restoring: boolean;
  onRestore: () => void;
};

export function OldJobCard({ job, restoring, onRestore }: Props) {
  const ring = scoreColor(job.fitScore);
  const applied = job.status === "applied";
  const meta = [job.company, job.city].filter(Boolean).join(" · ");

  return (
    <div className={`jh-old${restoring ? " jh-old--out" : ""}`}>
      <span
        className="jh-chip"
        style={{ "--ring": ring } as CSSProperties}
        title={`Fit ${formatScore(job.fitScore)}/10`}
      >
        {formatScore(job.fitScore)}
      </span>

      <div className="jh-old-main">
        <a className="jh-old-title" href={job.url} target="_blank" rel="noreferrer">
          {job.title}
        </a>
        {meta ? <span className="jh-old-meta">{meta}</span> : null}
      </div>

      <span className={`jh-badge ${applied ? "jh-badge--applied" : "jh-badge--skipped"}`}>
        {applied ? "Applied" : "Skipped"}
      </span>

      <div className="jh-old-links">
        <ArtifactLinks job={job} />
        <a className="jh-link" href={job.url} target="_blank" rel="noreferrer">
          View ↗
        </a>
        <button
          type="button"
          className="jh-btn jh-btn--ghost"
          disabled={restoring}
          onClick={onRestore}
        >
          {restoring ? "Restoring…" : "Restore"}
        </button>
      </div>
    </div>
  );
}
