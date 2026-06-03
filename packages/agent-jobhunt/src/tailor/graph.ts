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

function shouldRevise(state: TailorStateType): "revise" | "render" {
  return state.atsCheckResult?.ok ? "render" : "revise";
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
  .addEdge("revise", "render")
  .addEdge("render", "persist")
  .addEdge("persist", END)
  .compile({ checkpointer });
