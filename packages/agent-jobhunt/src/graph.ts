import "server-only";
import { StateGraph, START, END } from "@langchain/langgraph";
import { JobHuntState } from "./state";
import { scrapeNode } from "./nodes/scrape";
import { parseNode } from "./nodes/parse";
import { persistNode } from "./nodes/persist";
import { deepScrapeNode } from "./nodes/deep-scrape";
import { dedupeNode } from "./nodes/dedupe";
import { checkpointer } from "./checkpointer";

// Phase 1 of the daily run: scrape every board's listings, parse + persist Job
// rows, deep-scrape each JD, then cross-board dedupe. Compiled as its OWN graph
// so the Inngest function runs it in a dedicated step.run("ingest") — one Vercel
// invocation with a fresh maxDuration budget.
//
// The evaluate + tailor phases are deliberately NOT in this graph: they are
// DB-driven (they read Job rows by status, written here) and each job runs in
// its OWN Inngest child invocation (evaluateJob/tailorJob in inngest.ts, fanned
// out via step.invoke). Keeping the whole pipeline out of one step.run is what
// avoids Vercel's 800s FUNCTION_INVOCATION_TIMEOUT and lets per-job work scale
// horizontally.
export const ingestGraph = new StateGraph(JobHuntState)
  .addNode("scrape", scrapeNode)
  .addNode("parse", parseNode)
  .addNode("persist", persistNode)
  .addNode("deep-scrape", deepScrapeNode)
  .addNode("dedupe", dedupeNode)
  .addEdge(START, "scrape")
  .addEdge("scrape", "parse")
  .addEdge("parse", "persist")
  .addEdge("persist", "deep-scrape")
  .addEdge("deep-scrape", "dedupe")
  .addEdge("dedupe", END)
  .compile({ checkpointer });
