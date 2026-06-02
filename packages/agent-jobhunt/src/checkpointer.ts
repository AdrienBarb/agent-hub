import "server-only";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { env } from "@hub/core/env";

export const checkpointer = PostgresSaver.fromConnString(env.DIRECT_URL);

let setupDone = false;

export async function setupCheckpointer(): Promise<void> {
  if (setupDone) return;
  await checkpointer.setup();
  setupDone = true;
}
