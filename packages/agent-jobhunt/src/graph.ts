import "server-only";
import { StateGraph, START, END } from "@langchain/langgraph";
import { JobHuntState } from "./state";
import { scrapeNode } from "./nodes/scrape";
import { parseNode } from "./nodes/parse";
import { persistNode } from "./nodes/persist";
import {
  dedupePlaceholder,
  evaluatePlaceholder,
  tailorPlaceholder,
  renderPlaceholder,
} from "./nodes/placeholders";

// scrape → parse → persist → dedupe → evaluate → tailor → render → END
// iter 1 real:        scrape, parse, persist
// iter 1 placeholder: dedupe, evaluate, tailor, render
export const jobHuntGraph = new StateGraph(JobHuntState)
  .addNode("scrape", scrapeNode)
  .addNode("parse", parseNode)
  .addNode("persist", persistNode)
  .addNode("dedupe", dedupePlaceholder)
  .addNode("evaluate", evaluatePlaceholder)
  .addNode("tailor", tailorPlaceholder)
  .addNode("render", renderPlaceholder)
  .addEdge(START, "scrape")
  .addEdge("scrape", "parse")
  .addEdge("parse", "persist")
  .addEdge("persist", "dedupe")
  .addEdge("dedupe", "evaluate")
  .addEdge("evaluate", "tailor")
  .addEdge("tailor", "render")
  .addEdge("render", END)
  .compile();
