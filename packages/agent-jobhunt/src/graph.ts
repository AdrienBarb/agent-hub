import "server-only";
import { StateGraph, START, END } from "@langchain/langgraph";
import { JobHuntState } from "./state";
import { scrapeNode } from "./nodes/scrape";
import { parseNode } from "./nodes/parse";
import { persistNode } from "./nodes/persist";
import { deepScrapeNode } from "./nodes/deep-scrape";
import {
  dedupePlaceholder,
  renderPlaceholder,
} from "./nodes/placeholders";
import {
  dispatchEvaluationsEdge,
  evaluateOneNode,
} from "./nodes/dispatch-evaluations";
import {
  dispatchTailoringsEdge,
  postEvalFanInNode,
  tailorOneNode,
} from "./nodes/dispatch-tailorings";
import { checkpointer } from "./checkpointer";

export const jobHuntGraph = new StateGraph(JobHuntState)
  .addNode("scrape", scrapeNode)
  .addNode("parse", parseNode)
  .addNode("persist", persistNode)
  .addNode("deep-scrape", deepScrapeNode)
  .addNode("dedupe", dedupePlaceholder)
  .addNode("evaluate-one", evaluateOneNode)
  .addNode("post-eval", postEvalFanInNode)
  .addNode("tailor-one", tailorOneNode)
  .addNode("render", renderPlaceholder)
  .addEdge(START, "scrape")
  .addEdge("scrape", "parse")
  .addEdge("parse", "persist")
  .addEdge("persist", "deep-scrape")
  .addEdge("deep-scrape", "dedupe")
  .addConditionalEdges("dedupe", dispatchEvaluationsEdge, [
    "evaluate-one",
    "post-eval",
  ])
  .addEdge("evaluate-one", "post-eval")
  .addConditionalEdges("post-eval", dispatchTailoringsEdge, [
    "tailor-one",
    "render",
  ])
  .addEdge("tailor-one", "render")
  .addEdge("render", END)
  .compile({ checkpointer });
