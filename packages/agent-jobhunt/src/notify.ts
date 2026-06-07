import "server-only";
import {
  postSlackMessage,
  postSlackThreadReply,
  isSlackConfigured,
  type SlackMessage,
} from "@hub/core/slack";
import { env } from "@hub/core/env";
import { manifest } from "./manifest";
import { groupWarnings, type RunWarning } from "./warnings";

/**
 * Job-hunt Slack content builders + senders. Core owns the transport
 * (best-effort, never throws); this module owns the message shape. All senders
 * are no-ops when Slack is unconfigured.
 */

type Block = NonNullable<SlackMessage["blocks"]>[number];

export interface OpportunitySummary {
  title: string;
  company: string | null;
  city: string | null;
  url: string;
  fitScore: number | null;
  fitReasoning: string | null;
}

export interface ScrapedJobSummary {
  board: string;
  title: string;
  company: string | null;
  status: string;
}

export interface RunCompleteSummary {
  evaluatedCount: number;
  /** Jobs that reached status=tailored in THIS run, sorted by fitScore desc. */
  opportunities: OpportunitySummary[];
  /** Every job scraped this run (debug aid), grouped by board downstream. */
  scrapedJobs: ScrapedJobSummary[];
  warnings: RunWarning[];
  /** env.JOBHUNT_NOTIFY_SCRAPED_LIST — include the scraped list + relax the gate. */
  includeScrapedList: boolean;
}

export interface RunFailedSummary {
  runId: string;
  /** ALREADY redacted (redactConnString) before it reaches here. */
  message: string;
  startedAt?: Date | null;
}

const MAX_OPPORTUNITIES = 8;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Neutralize backtick runs so scraped/board text can't prematurely close a Slack
// code fence (```), which would re-enable mrkdwn parsing on uncontrolled text.
function fence(s: string): string {
  return s.replace(/`/g, "ʼ");
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function tierEmoji(fit: number | null): string {
  if (fit == null) return "⚪";
  if (fit >= 8) return "🟢";
  if (fit >= 6.5) return "🟡";
  return "🔴";
}

function boardLink(): string | null {
  const base = env.HUB_BASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}${manifest.dashboardPath}`;
}

function opportunitySection(job: OpportunitySummary): Block {
  const where = [job.company, job.city].filter(Boolean).join(" · ");
  const score = job.fitScore != null ? `  *${job.fitScore.toFixed(1)}/10*` : "";
  const head = `${tierEmoji(job.fitScore)} *${esc(truncate(job.title, 200))}*${
    where ? ` · ${esc(truncate(where, 200))}` : ""
  }${score}`;
  const reason = job.fitReasoning
    ? `\n${esc(truncate(job.fitReasoning, 280))}`
    : "";
  // Skip the link if the url is implausibly long — keeps the section well under
  // Slack's 3000-char limit (a truncated url wouldn't navigate anyway).
  const link = job.url.length <= 600 ? `\n<${job.url}|View posting →>` : "";
  return { type: "section", text: { type: "mrkdwn", text: head + reason + link } };
}

export function buildSuccessMessage(summary: RunCompleteSummary): SlackMessage {
  const oppCount = summary.opportunities.length;
  const scrapedCount = summary.scrapedJobs.length;
  const headerText =
    oppCount > 0
      ? `✨ Job Hunt — ${oppCount} new ${oppCount === 1 ? "opportunity" : "opportunities"}`
      : "Job Hunt — run complete";

  const blocks: Block[] = [
    { type: "header", text: { type: "plain_text", text: headerText, emoji: true } },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${scrapedCount} scraped · ${summary.evaluatedCount} evaluated · ${oppCount} tailored`,
        },
      ],
    },
  ];

  if (oppCount > 0) {
    blocks.push({ type: "divider" });
    for (const job of summary.opportunities.slice(0, MAX_OPPORTUNITIES)) {
      blocks.push(opportunitySection(job));
    }
    if (oppCount > MAX_OPPORTUNITIES) {
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `…and ${oppCount - MAX_OPPORTUNITIES} more on the board`,
          },
        ],
      });
    }
  }

  if (summary.warnings.length > 0) {
    const line = groupWarnings(summary.warnings)
      .map((g) => `${g.label} (${g.total})`)
      .join("  ·  ");
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `⚠️ *Issues this run:*\n${line}` },
    });
  }

  const board = boardLink();
  if (board) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `<${board}|Open board →>` }],
    });
  }

  const text =
    oppCount > 0
      ? `Job Hunt — ${oppCount} new opportunit${oppCount === 1 ? "y" : "ies"}`
      : "Job Hunt — run complete";
  return { text, blocks };
}

/**
 * Full "everything scraped this run" listing for the thread under the digest —
 * grouped by board, one compact line per job, chunked into code blocks that
 * respect Slack's 3000-char section limit.
 */
export function buildScrapedListChunks(
  scraped: ScrapedJobSummary[],
): SlackMessage[] {
  if (scraped.length === 0) return [];

  const byBoard = new Map<string, ScrapedJobSummary[]>();
  for (const j of scraped) {
    const arr = byBoard.get(j.board) ?? [];
    arr.push(j);
    byBoard.set(j.board, arr);
  }

  const lines: string[] = [];
  for (const [board, jobs] of byBoard) {
    lines.push(`# ${board} (${jobs.length})`);
    for (const j of jobs) {
      // Truncate each line so a single one can never exceed the chunk budget,
      // and fence backticks so a title can't break the code block.
      lines.push(
        truncate(
          `• ${fence(j.title)} — ${fence(j.company ?? "?")} [${j.status}]`,
          500,
        ),
      );
    }
    lines.push("");
  }

  const chunks: string[] = [];
  let buf = "";
  for (const line of lines) {
    if (buf.length + line.length + 1 > 2600 && buf.length > 0) {
      chunks.push(buf);
      buf = "";
    }
    buf += `${line}\n`;
  }
  if (buf.trim()) chunks.push(buf);

  return chunks.map((chunk, i) => ({
    text:
      i === 0
        ? `Scraped this run (${scraped.length})`
        : `Scraped this run (cont. ${i + 1})`,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `\`\`\`\n${chunk.trimEnd()}\n\`\`\`` },
      },
    ],
  }));
}

export function buildFailureMessage(summary: RunFailedSummary): SlackMessage {
  const msg = summary.message || "Unknown error";
  const blocks: Block[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "🚨 Job Hunt run failed", emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Run* \`${summary.runId}\`${
          summary.startedAt ? ` · ${summary.startedAt.toISOString()}` : ""
        }`,
      },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `\`\`\`\n${fence(truncate(msg, 2500))}\n\`\`\`` },
    },
  ];
  const board = boardLink();
  if (board) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `<${board}|Open board →>` }],
    });
  }
  return { text: `🚨 Job Hunt run failed: ${truncate(msg, 200)}`, blocks };
}

/**
 * Post the run-complete digest. Noise gate: send only when there's something to
 * report — ≥1 opportunity, ≥1 warning, or (debug) ≥1 scraped job when the
 * scraped-list toggle is on. The full scraped list goes in a thread reply.
 */
export async function notifyRunComplete(
  summary: RunCompleteSummary,
): Promise<void> {
  if (!isSlackConfigured()) return;

  const hasOpportunities = summary.opportunities.length > 0;
  const hasWarnings = summary.warnings.length > 0;
  const showScraped =
    summary.includeScrapedList && summary.scrapedJobs.length > 0;
  if (!hasOpportunities && !hasWarnings && !showScraped) return;

  const parent = await postSlackMessage(buildSuccessMessage(summary));
  if (showScraped && parent) {
    for (const chunk of buildScrapedListChunks(summary.scrapedJobs)) {
      await postSlackThreadReply(parent.ts, chunk);
    }
  }
}

/** Post the hard-failure alert. `summary.message` must already be redacted. */
export async function notifyRunFailed(summary: RunFailedSummary): Promise<void> {
  if (!isSlackConfigured()) return;
  await postSlackMessage(buildFailureMessage(summary));
}
