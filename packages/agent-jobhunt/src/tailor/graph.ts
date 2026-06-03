import "server-only";
import { StateGraph, START, END } from "@langchain/langgraph";
import { checkpointer } from "../checkpointer";
import { TailorState, type TailorStateType } from "./state";
import { planNode } from "./nodes/plan";
import { draftResumeNode } from "./nodes/draft-resume";
import { draftCoverNode } from "./nodes/draft-cover";
import { atsCheckNode } from "./nodes/ats-check";
import { reviseNode } from "./nodes/revise";
import { renderNode } from "./nodes/render";
import { persistNode } from "./nodes/persist";

// At most this many LLM revise passes before we render the best draft we have.
// Base path is ~7 super-steps and each loop adds ~2, so 2 stays well under the
// default recursionLimit of 25 — but the loop terminates on THIS counter, never
// on recursionLimit (which would throw and lose the best-effort render path).
const MAX_REVISES = 2;

function shouldRevise(state: TailorStateType): "revise" | "render" {
  if (state.atsCheckResult?.ok) return "render";
  // Revise budget spent: render anyway (best-effort, mirrors render-never-throws
  // and the legacy "ATS warn, don't halt" rule). The final atsCheckResult is
  // still persisted to tailorDetails for the audit trail.
  if ((state.reviseCount ?? 0) >= MAX_REVISES) return "render";
  return "revise";
}

export const tailorSubgraph = new StateGraph(TailorState)
  .addNode("plan-job", planNode)
  .addNode("draft-resume", draftResumeNode)
  .addNode("draft-cover", draftCoverNode)
  .addNode("ats-check", atsCheckNode)
  .addNode("revise", reviseNode)
  .addNode("render", renderNode)
  .addNode("persist", persistNode)
  .addEdge(START, "plan-job")
  .addEdge("plan-job", "draft-resume")
  .addEdge("draft-resume", "draft-cover")
  .addEdge("draft-cover", "ats-check")
  .addConditionalEdges("ats-check", shouldRevise, ["revise", "render"])
  // Closes the loop: a revised draft is re-validated by ats-check, which decides
  // (via shouldRevise) whether to revise again, give up, or render.
  .addEdge("revise", "ats-check")
  .addEdge("render", "persist")
  .addEdge("persist", END)
  .compile({ checkpointer });
