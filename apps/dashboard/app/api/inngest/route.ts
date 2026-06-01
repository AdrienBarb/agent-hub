import { serve } from "inngest/next";
import { inngest } from "@hub/core/inngest";
import { env } from "@hub/core/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [],
  signingKey: env.INNGEST_SIGNING_KEY,
});
