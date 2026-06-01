import "server-only";
import { StateGraph, START, END } from "@langchain/langgraph";
import { JobHuntState } from "./state";
import { scrapeNode } from "./nodes/scrape";
import { parseNode } from "./nodes/parse";
import { persistNode } from "./nodes/persist";
import {
  dedupeStub,
  evaluateStub,
  tailorStub,
  renderStub,
} from "./nodes/stubs";

/**
 * Job-hunt pipeline graph.
 *
 *   START → scrape → parse → persist → dedupe → evaluate → tailor → render → END
 *
 * Real nodes (iter 1):  scrape, parse, persist
 * Stub nodes (iter 1):  dedupe, evaluate, tailor, render
 *
 * Each stub logs and passes state through. Replace one stub at a time per
 * iteration; the graph topology stays stable.
 */
export const jobHuntGraph = new StateGraph(JobHuntState)
  .addNode("scrape", scrapeNode)
  .addNode("parse", parseNode)
  .addNode("persist", persistNode)
  .addNode("dedupe", dedupeStub)
  .addNode("evaluate", evaluateStub)
  .addNode("tailor", tailorStub)
  .addNode("render", renderStub)
  .addEdge(START, "scrape")
  .addEdge("scrape", "parse")
  .addEdge("parse", "persist")
  .addEdge("persist", "dedupe")
  .addEdge("dedupe", "evaluate")
  .addEdge("evaluate", "tailor")
  .addEdge("tailor", "render")
  .addEdge("render", END)
  .compile();
