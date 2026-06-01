import "server-only";
import type { JobHuntStateType } from "../state";

/**
 * Placeholder nodes for stages that don't exist yet. They log what they would
 * do and pass state through unchanged. Future iterations replace each with a
 * real implementation (often a subgraph).
 */
function makeStub(name: string, plannedFor: string) {
  return async function stub(
    state: JobHuntStateType,
  ): Promise<Partial<JobHuntStateType>> {
    console.log(
      `[${name}] STUB — pass-through. ${state.persistedCount} persisted, ${state.parsedJobs.length} parsed. ${plannedFor}`,
    );
    return {};
  };
}

export const dedupeStub = makeStub("dedupe", "iter 2: fingerprint dedup across boards");
export const evaluateStub = makeStub("evaluate", "iter 3: LLM fit scoring subgraph");
export const tailorStub = makeStub("tailor", "iter 4: resume + cover tailoring subgraph");
export const renderStub = makeStub("render", "iter 5: Typst PDF render");
