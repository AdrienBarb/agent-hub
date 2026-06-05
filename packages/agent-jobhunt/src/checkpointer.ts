import "server-only";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { env } from "@hub/core/env";

// The checkpointer lives in its OWN Postgres schema ("langgraph"), not public.
// Prisma manages `public` and is migration-tracked; keeping the LangGraph
// checkpoint_* tables out of `public` means `prisma migrate dev` never sees
// them as drift. setup() runs `CREATE SCHEMA IF NOT EXISTS "langgraph"` itself.
export const checkpointer = PostgresSaver.fromConnString(env.DIRECT_URL, {
  schema: "langgraph",
});

let setupDone = false;

export async function setupCheckpointer(): Promise<void> {
  if (setupDone) return;
  await checkpointer.setup();
  setupDone = true;
}
