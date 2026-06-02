import "server-only";
import { StateGraph, START, END } from "@langchain/langgraph";
import { checkpointer } from "../checkpointer";
import { EvaluatorState, type EvaluatorStateType } from "./state";
import { extractNode } from "./nodes/extract";
import { compareNode } from "./nodes/compare";
import { scoreNode } from "./nodes/score";
import { critiqueNode } from "./nodes/critique";
import { persistNode } from "./nodes/persist";

function shouldCritique(state: EvaluatorStateType): "critique" | "persist" {
  return state.score?.confidence === "high" ? "persist" : "critique";
}

export const evaluatorSubgraph = new StateGraph(EvaluatorState)
  .addNode("extract", extractNode)
  .addNode("compare", compareNode)
  .addNode("score", scoreNode)
  .addNode("critique", critiqueNode)
  .addNode("persist", persistNode)
  .addEdge(START, "extract")
  .addEdge("extract", "compare")
  .addEdge("compare", "score")
  .addConditionalEdges("score", shouldCritique, ["critique", "persist"])
  .addEdge("critique", "persist")
  .addEdge("persist", END)
  .compile({ checkpointer });
