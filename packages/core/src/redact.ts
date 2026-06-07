import "server-only";

// Pure scrubber for error strings persisted to AgentRun.errorMessage, which the
// dashboard renders raw (browser-visible). Two complementary passes:
//   (a) regex — strips credentials from any `scheme://user:pass@host` URL
//       (covers DIRECT_URL / DATABASE_URL connection-string leaks from Prisma /
//       PostgresSaver errors), and
//   (b) value sweep — replaces the live values of known secret env vars wherever
//       they appear (e.g. an API key echoed inside a 401 error body).
// MUST NEVER THROW: it runs on the agent's failure path, so the whole body is
// guarded and falls back to whatever has been scrubbed so far.

// Env var NAMES whose live VALUES must never surface in a stored error string.
const SECRET_ENV_KEYS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "ANTHROPIC_API_KEY",
  "FIRECRAWL_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "INNGEST_SIGNING_KEY",
  "INNGEST_EVENT_KEY",
  "LANGFUSE_SECRET_KEY",
  "LANGFUSE_PUBLIC_KEY",
  "HUB_ACCESS_TOKEN",
  "VERCEL_TOKEN",
  // Browserbase session connect URL embeds the API key as a query param
  // (wss://connect.browserbase.com?apiKey=…); a connectOverCDP error can echo it.
  "BROWSERBASE_API_KEY",
  "BROWSERBASE_PROJECT_ID",
  // Slack bot token (xoxb-…) — a @slack/web-api error body can echo the token.
  "SLACK_BOT_TOKEN",
] as const;

export function redactConnString(input: string): string {
  if (!input) return input;
  let out = input;

  try {
    // (a) URL userinfo for ANY scheme: `scheme://user:pass@host` -> `scheme://***@host`.
    // `[^\s/]*` is greedy up to the last `@` before the path `/`, so a password
    // containing `@` (percent-encoded or not) is still fully masked.
    out = out.replace(
      /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^\s/]*@/g,
      (_match, scheme: string) => `${scheme}***@`,
    );

    // (b) Known secret env VALUES, wherever they appear. Value-based (not
    // name-based) so it catches the secret inside a JSON error body. Length-gated
    // to avoid a short placeholder over-matching unrelated text.
    const procEnv =
      typeof process !== "undefined" && process.env ? process.env : undefined;
    if (procEnv) {
      for (const key of SECRET_ENV_KEYS) {
        const val = procEnv[key];
        if (val && val.length >= 8 && out.includes(val)) {
          out = out.split(val).join(`[REDACTED:${key}]`);
        }
      }
    }
  } catch {
    // Never let redaction throw on the error path.
  }

  return out;
}
