import "server-only";
import { WebClient, type KnownBlock } from "@slack/web-api";
import { env } from "./env";

/**
 * Slack transport — agent-agnostic. Mirrors the optional-integration contract of
 * langfuse.ts: a no-op when unconfigured and NEVER throws, because notifications
 * are best-effort and must never fail (or mask the error of) an agent run.
 *
 * Env is read INSIDE the functions (never at module scope) so the Next.js
 * build-phase env placeholder (env.ts) never instantiates a real client. The
 * WebClient is memoized per process.
 */

export interface SlackMessage {
  /** Plain-text fallback shown in notifications + clients without Block Kit. */
  text: string;
  /** Optional Block Kit blocks for rich formatting. */
  blocks?: KnownBlock[];
}

let client: WebClient | undefined;

/** True only when both a bot token and a target channel are configured. */
export function isSlackConfigured(): boolean {
  return Boolean(env.SLACK_BOT_TOKEN && env.SLACK_CHANNEL);
}

function getClient(): WebClient | null {
  const token = env.SLACK_BOT_TOKEN;
  if (!token) return null;
  if (!client) client = new WebClient(token);
  return client;
}

/**
 * Post a top-level message to the configured channel. No-ops (returns null) when
 * unconfigured; never throws. Returns the message `ts` so callers can thread
 * follow-up replies under it.
 */
export async function postSlackMessage(
  message: SlackMessage,
): Promise<{ ts: string } | null> {
  const channel = env.SLACK_CHANNEL;
  const slack = getClient();
  if (!channel || !slack) return null;
  try {
    const res = await slack.chat.postMessage({
      channel,
      text: message.text,
      blocks: message.blocks,
      unfurl_links: false,
      unfurl_media: false,
    });
    return res.ts ? { ts: res.ts } : null;
  } catch (err) {
    console.error(
      "[slack] postMessage failed (best-effort):",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Reply in-thread under a previously posted message. No-ops when unconfigured;
 * never throws.
 */
export async function postSlackThreadReply(
  threadTs: string,
  message: SlackMessage,
): Promise<void> {
  const channel = env.SLACK_CHANNEL;
  const slack = getClient();
  if (!channel || !slack) return;
  try {
    await slack.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: message.text,
      blocks: message.blocks,
      unfurl_links: false,
      unfurl_media: false,
    });
  } catch (err) {
    console.error(
      "[slack] thread reply failed (best-effort):",
      err instanceof Error ? err.message : err,
    );
  }
}
