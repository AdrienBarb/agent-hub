import "server-only";
import type { JobHuntStateType } from "../state";

function makePlaceholder(name: string, plannedFor: string) {
  return async function placeholder(
    state: JobHuntStateType,
  ): Promise<Partial<JobHuntStateType>> {
    console.log(
      `[${name}] placeholder pass-through. parsed=${state.parsedJobs.length} persisted=${state.persistedCount}. ${plannedFor}`,
    );
    return {};
  };
}

export const dedupePlaceholder = makePlaceholder("dedupe", "iter 2: fingerprint dedup across boards");
export const evaluatePlaceholder = makePlaceholder("evaluate", "iter 3: LLM fit scoring subgraph");
export const tailorPlaceholder = makePlaceholder("tailor", "iter 4: resume + cover tailoring subgraph");
export const renderPlaceholder = makePlaceholder("render", "iter 5: Typst PDF render");
