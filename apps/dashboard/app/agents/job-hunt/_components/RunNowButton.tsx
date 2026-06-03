"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { triggerJobHuntRun, type RunNowState } from "../actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        padding: "0.6rem 1.1rem",
        background: pending ? "#aaa" : "#fff",
        color: "#000",
        border: "none",
        borderRadius: 6,
        fontWeight: 600,
        cursor: pending ? "default" : "pointer",
      }}
    >
      {pending ? "Enqueuing…" : "Run now"}
    </button>
  );
}

export function RunNowButton() {
  const [state, formAction] = useActionState<RunNowState, FormData>(
    triggerJobHuntRun,
    null,
  );
  return (
    <form action={formAction} style={{ textAlign: "right" }}>
      <SubmitButton />
      {state ? (
        <div
          style={{
            marginTop: "0.4rem",
            fontSize: "0.8rem",
            color: state.ok ? "#4ade80" : "#f87171",
          }}
        >
          {state.message}
        </div>
      ) : null}
    </form>
  );
}
