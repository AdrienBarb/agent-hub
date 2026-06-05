"use client";

import { useEffect, useRef, useState } from "react";
import {
  useJobs,
  useMarkJob,
  useRefreshJobsOnRunComplete,
  useRunStatus,
} from "../_hooks/useJobHunt";
import { JobCard } from "./JobCard";
import { OldJobCard } from "./OldJobCard";
import type { JobView } from "./types";
import type { MarkableStatus } from "@/lib/job-hunt/types";

// Keep in sync with the .jh-card--out / .jh-old--out transition in page.tsx so
// the row finishes animating before the optimistic mutation drops it.
const ANIM_MS = 300;

function omit<T>(map: Record<string, T>, id: string): Record<string, T> {
  const next = { ...map };
  delete next[id];
  return next;
}

export function JobsBoard() {
  const { data: runStatus } = useRunStatus();
  const isRunning = runStatus?.running ?? false;
  useRefreshJobsOnRunComplete(isRunning);

  const { data, isPending, isError, refetch } = useJobs(isRunning);
  const markJob = useMarkJob();

  // Per-id transient view state for the exit animation, kept separate from the
  // query cache (which is the data source of truth).
  const [dismissing, setDismissing] = useState<
    Record<string, "applied" | "rejected">
  >({});
  const [restoring, setRestoring] = useState<Record<string, boolean>>({});

  // Pending animation timers, cleared on unmount so a mutation never fires (and
  // no state update lands) after the board has gone away.
  const timers = useRef<number[]>([]);
  useEffect(
    () => () => timers.current.forEach((t) => window.clearTimeout(t)),
    [],
  );

  // Let the card animate out, then commit the move. The optimistic mutation
  // removes the row from the cache only after it's faded, so there's no flicker.
  // Errors roll back in the hook and toast via the axios interceptor; the
  // component only clears its own animation state on settle.
  function commitAfterAnimation(
    job: JobView,
    status: MarkableStatus,
    clear: () => void,
  ) {
    const timer = window.setTimeout(() => {
      markJob.mutate({ job, status }, { onSettled: clear });
    }, ANIM_MS);
    timers.current.push(timer);
  }

  function handleMark(job: JobView, status: "applied" | "rejected") {
    if (dismissing[job.id]) return;
    setDismissing((m) => ({ ...m, [job.id]: status }));
    commitAfterAnimation(job, status, () =>
      setDismissing((m) => omit(m, job.id)),
    );
  }

  function handleRestore(job: JobView) {
    if (restoring[job.id]) return;
    setRestoring((m) => ({ ...m, [job.id]: true }));
    commitAfterAnimation(job, "tailored", () =>
      setRestoring((m) => omit(m, job.id)),
    );
  }

  // Skeleton only before the first load. Once we have data, a failed background
  // poll keeps the last-good board rather than blanking it.
  if (isPending) {
    return <BoardSkeleton />;
  }

  if (isError && !data) {
    return (
      <section className="jh-section">
        <div className="jh-error">
          <span>Couldn&apos;t load jobs.</span>
          <button
            type="button"
            className="jh-btn jh-btn--ghost"
            onClick={() => void refetch()}
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  const active = data?.active ?? [];
  const old = data?.old ?? [];

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
                pending={!!dismissing[job.id]}
                dismissing={dismissing[job.id] ?? null}
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

function BoardSkeleton() {
  return (
    <>
      <section className="jh-section">
        <div className="jh-section-head">
          <h2 className="jh-h2">Jobs</h2>
          <p className="jh-section-sub">loading today&apos;s batch…</p>
        </div>
        <div className="jh-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="jh-skel" />
          ))}
        </div>
      </section>
      <section className="jh-section">
        <div className="jh-section-head">
          <h2 className="jh-h2 jh-h2--muted">Old jobs</h2>
        </div>
        <div className="jh-oldlist">
          {[0, 1].map((i) => (
            <div key={i} className="jh-skel jh-skel--old" />
          ))}
        </div>
      </section>
    </>
  );
}
