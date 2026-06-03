import { serve } from "inngest/next";
import { inngest } from "@hub/core/inngest";
import { env } from "@hub/core/env";
import { jobHuntFunctions } from "@hub/agent-jobhunt/inngest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A full job-hunt run (scrape + deep-scrape + N evaluators + N tailorings +
// Typst render) cannot finish in 60s. 800s is the Vercel Pro function ceiling.
export const maxDuration = 800;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [...jobHuntFunctions],
  signingKey: env.INNGEST_SIGNING_KEY,
});
