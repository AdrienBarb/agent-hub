"use server";

import { revalidatePath } from "next/cache";
import { inngest } from "@hub/core/inngest";

export async function triggerJobHuntRun(): Promise<void> {
  await inngest.send({
    name: "jobhunt/run.requested",
    data: { triggeredAt: new Date().toISOString(), source: "dashboard" },
  });
  revalidatePath("/agents/job-hunt");
}
