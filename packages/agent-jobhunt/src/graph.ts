import "server-only";
import { StateGraph, START, END } from "@langchain/langgraph";
import { JobHuntState } from "./state";
import { scrapeNode } from "./nodes/scrape";
import { parseNode } from "./nodes/parse";
import { persistNode } from "./nodes/persist";
import { checkpointer } from "./checkpointer";

// Phase 1a of the daily run: scrape every board's listings, parse + persist Job
// rows (status="new"). Compiled as its OWN graph so the Inngest orchestrator runs
// it in a dedicated step.run("ingest-collect") — one Vercel invocation with a
// fresh maxDuration budget.
//
// Deep-scrape and dedupe USED TO live in this graph too (one step.run("ingest")),
// but their combined wall-clock — dozens of sequential LinkedIn Browserbase JD
// fetches plus ~100 sequential dedupe LLM calls — crossed Vercel's 800s
// FUNCTION_INVOCATION_TIMEOUT ceiling on a big LinkedIn day. The killed
// invocation reset its HTTP response before the step memoized, so Inngest
// re-drove the orchestrator and re-ran the WHOLE ingest, compounding until the
// run died (AgentRun stuck "running": the transport-level reset never reached the
// orchestrator's catch → fail-agent-run). Each is now its own Inngest step (see
// inngest.ts) with a fresh 800s budget + independent retries/memoization. The DB
// (Job rows by runId) is the inter-phase state, exactly like the evaluate/tailor
// fan-outs, which are likewise DB-driven and out of this graph.
export const collectGraph = new StateGraph(JobHuntState)
  .addNode("scrape", scrapeNode)
  .addNode("parse", parseNode)
  .addNode("persist", persistNode)
  .addEdge(START, "scrape")
  .addEdge("scrape", "parse")
  .addEdge("parse", "persist")
  .addEdge("persist", END)
  .compile({ checkpointer });
