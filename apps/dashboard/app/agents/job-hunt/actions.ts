"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { inngest } from "@hub/core/inngest";
import { db } from "@hub/core/db";
import { env } from "@hub/core/env";
import { safeStrEqual } from "@/lib/safe-equal";

// Constant-time auth used by every mutating action on this route. proxy.ts only
// gates the page render; server actions POST to the same origin and must
// re-verify the cookie themselves.
async function isAuthed(): Promise<boolean> {
  const store = await cookies();
  const token = store.get("hub_token")?.value;
  return safeStrEqual(token, env.HUB_ACCESS_TOKEN);
}

// Returned to the client so the Run-now button can render success/failure.
// Type-only export is erased at runtime, so it doesn't violate the "use server"
// rule that runtime exports must be async functions.
export type RunNowState = { ok: boolean; message: string } | null;

export async function triggerJobHuntRun(
  _prevState: RunNowState,
  _formData: FormData,
): Promise<RunNowState> {
  if (!(await isAuthed())) {
    return { ok: false, message: "Unauthorized" };
  }

  try {
    await inngest.send({
      name: "jobhunt/run.requested",
      data: { triggeredAt: new Date().toISOString(), source: "dashboard" },
    });
  } catch (err) {
    console.error("triggerJobHuntRun: inngest.send failed", err);
    return { ok: false, message: "Failed to enqueue run" };
  }

  revalidatePath("/agents/job-hunt");
  return { ok: true, message: "Run enqueued" };
}

// Statuses the dashboard is allowed to set on a job. "applied"/"rejected" are
// the user's Apply/Skip actions; "tailored" is the Restore action (moves a job
// back out of the Old-jobs list). Anything else is rejected — the client never
// gets to write an arbitrary JobStatus.
const MARKABLE = ["applied", "rejected", "tailored"] as const;
export type MarkableStatus = (typeof MARKABLE)[number];
export type MarkJobResult = { ok: boolean; message: string };

export async function markJob(
  jobId: string,
  status: MarkableStatus,
): Promise<MarkJobResult> {
  if (!(await isAuthed())) {
    return { ok: false, message: "Unauthorized" };
  }
  if (!jobId || !MARKABLE.includes(status)) {
    return { ok: false, message: "Bad request" };
  }

  try {
    await db.job.update({ where: { id: jobId }, data: { status } });
  } catch (err) {
    console.error("markJob: update failed", err);
    return { ok: false, message: "Failed to update job" };
  }

  revalidatePath("/agents/job-hunt");
  return { ok: true, message: "Updated" };
}
