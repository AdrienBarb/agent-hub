import "server-only";
import { Inngest } from "inngest";
import { env } from "./env";

export const inngest = new Inngest({
  id: "agent-hub",
  eventKey: env.INNGEST_EVENT_KEY,
  signingKey: env.INNGEST_SIGNING_KEY,
  // The job-hunt run fans out ~45 parallel step.invoke calls (one per job). This
  // batches the per-step planning requests Inngest makes while a Promise.all
  // resolves, cutting round-trips instead of one request per parallel step.
  optimizeParallelism: true,
});
