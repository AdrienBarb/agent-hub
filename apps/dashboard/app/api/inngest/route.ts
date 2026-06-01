import { serve } from "inngest/next";
import { inngest } from "@hub/core/inngest";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [],
});
