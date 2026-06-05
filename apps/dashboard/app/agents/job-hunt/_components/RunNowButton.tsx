"use client";

import { useTriggerRun } from "../_hooks/useJobHunt";

export function RunNowButton() {
  const run = useTriggerRun();

  return (
    <div style={{ textAlign: "right" }}>
      <button
        type="button"
        onClick={() => run.mutate()}
        disabled={run.isPending}
        style={{
          padding: "0.6rem 1.1rem",
          background: run.isPending ? "#aaa" : "#fff",
          color: "#000",
          border: "none",
          borderRadius: 6,
          fontWeight: 600,
          cursor: run.isPending ? "default" : "pointer",
        }}
      >
        {run.isPending ? "Enqueuing…" : "Run now"}
      </button>
      {run.isSuccess || run.isError ? (
        <div
          style={{
            marginTop: "0.4rem",
            fontSize: "0.8rem",
            color: run.isError ? "#f87171" : "#4ade80",
          }}
        >
          {run.isError ? "Failed to enqueue run" : "Run enqueued"}
        </div>
      ) : null}
    </div>
  );
}
