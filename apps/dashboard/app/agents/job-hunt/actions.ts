"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { inngest } from "@hub/core/inngest";
import { env } from "@hub/core/env";
import { safeStrEqual } from "@/lib/safe-equal";

// Returned to the client so the Run-now button can render success/failure.
// Type-only export is erased at runtime, so it doesn't violate the "use server"
// rule that runtime exports must be async functions.
export type RunNowState = { ok: boolean; message: string } | null;

export async function triggerJobHuntRun(
  _prevState: RunNowState,
  _formData: FormData,
): Promise<RunNowState> {
  const store = await cookies();
  const token = store.get("hub_token")?.value;
  if (!(await safeStrEqual(token, env.HUB_ACCESS_TOKEN))) {
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
