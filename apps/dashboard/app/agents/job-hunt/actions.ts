"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { inngest } from "@hub/core/inngest";
import { env } from "@hub/core/env";

export async function triggerJobHuntRun(): Promise<void> {
  const store = await cookies();
  const token = store.get("hub_token")?.value;
  if (token !== env.HUB_ACCESS_TOKEN) {
    throw new Error("Unauthorized");
  }

  try {
    await inngest.send({
      name: "jobhunt/run.requested",
      data: { triggeredAt: new Date().toISOString(), source: "dashboard" },
    });
  } catch (err) {
    console.error("triggerJobHuntRun: inngest.send failed", err);
    throw new Error("Failed to enqueue run");
  }

  revalidatePath("/agents/job-hunt");
}
