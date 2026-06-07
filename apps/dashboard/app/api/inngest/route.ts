import { serve } from "inngest/next";
import { inngest } from "@hub/core/inngest";
import { env } from "@hub/core/env";
import { jobHuntFunctions } from "@hub/agent-jobhunt/inngest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The job-hunt run fans out: the orchestrator runs `ingest` as one step, then
// dispatches one child invocation PER job for evaluate + tailor. No single
// invocation runs the whole pipeline (that hit FUNCTION_INVOCATION_TIMEOUT at
// this wall), and per-job work scales horizontally. 800s (the Vercel Pro
// ceiling — requires Fluid Compute) bounds each individual invocation, which all
// sit well under it. `streaming` keeps the response open so any long single
// invocation can use the full budget on Fluid Compute.
export const maxDuration = 800;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [...jobHuntFunctions],
  signingKey: env.INNGEST_SIGNING_KEY,
  streaming: "allow",
});
