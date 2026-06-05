"use client";

import { useState } from "react";
import { markJob } from "../actions";
import { JobCard } from "./JobCard";
import { OldJobCard } from "./OldJobCard";
import type { JobView } from "./types";

// Keep in sync with the .jh-card--out / .jh-old--out transition in page.tsx so
// the row finishes animating before we drop it from the list.
const ANIM_MS = 300;

function omit<T>(map: Record<string, T>, id: string): Record<string, T> {
  const next = { ...map };
  delete next[id];
  return next;
}

export function JobsBoard({
  active: initialActive,
  old: initialOld,
}: {
  active: JobView[];
  old: JobView[];
}) {
  const [active, setActive] = useState(initialActive);
  const [old, setOld] = useState(initialOld);
  // Per-id transient UI state, separate from the persisted lists.
  const [marking, setMarking] = useState<Record<string, "applied" | "rejected">>({});
  const [restoring, setRestoring] = useState<Record<string, boolean>>({});

  async function handleMark(job: JobView, status: "applied" | "rejected") {
    if (marking[job.id]) return;
    setMarking((m) => ({ ...m, [job.id]: status }));
    const res = await markJob(job.id, status);
    if (!res.ok) {
      console.error("markJob failed:", res.message);
      setMarking((m) => omit(m, job.id));
      return;
    }
    // Let the card animate out, then move it into Old jobs.
    window.setTimeout(() => {
      setActive((list) => list.filter((j) => j.id !== job.id));
      setOld((list) => [{ ...job, status }, ...list]);
      setMarking((m) => omit(m, job.id));
    }, ANIM_MS);
  }

  async function handleRestore(job: JobView) {
    if (restoring[job.id]) return;
    setRestoring((m) => ({ ...m, [job.id]: true }));
    const res = await markJob(job.id, "tailored");
    if (!res.ok) {
      console.error("markJob failed:", res.message);
      setRestoring((m) => omit(m, job.id));
      return;
    }
    window.setTimeout(() => {
      setOld((list) => list.filter((j) => j.id !== job.id));
      setActive((list) => [{ ...job, status: "tailored" }, ...list]);
      setRestoring((m) => omit(m, job.id));
    }, ANIM_MS);
  }

  return (
    <>
      <section className="jh-section">
        <div className="jh-section-head">
          <h2 className="jh-h2">Jobs</h2>
          <span className="jh-count">{active.length}</span>
          <p className="jh-section-sub">tailored &amp; ready — pick Apply or Skip</p>
        </div>

        {active.length === 0 ? (
          <p className="jh-empty">
            No jobs ready to review. Run the agent to pull today&apos;s batch.
          </p>
        ) : (
          <div className="jh-grid">
            {active.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                pending={!!marking[job.id]}
                dismissing={marking[job.id] ?? null}
                onApply={() => handleMark(job, "applied")}
                onSkip={() => handleMark(job, "rejected")}
              />
            ))}
          </div>
        )}
      </section>

      <section className="jh-section">
        <div className="jh-section-head">
          <h2 className="jh-h2 jh-h2--muted">Old jobs</h2>
          <span className="jh-count jh-count--muted">{old.length}</span>
          <p className="jh-section-sub">applied &amp; skipped</p>
        </div>

        {old.length === 0 ? (
          <p className="jh-empty">
            Nothing here yet — Apply or Skip a job and it lands here.
          </p>
        ) : (
          <div className="jh-oldlist">
            {old.map((job) => (
              <OldJobCard
                key={job.id}
                job={job}
                restoring={!!restoring[job.id]}
                onRestore={() => handleRestore(job)}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
