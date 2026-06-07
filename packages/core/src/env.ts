import "server-only";
import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),

  ANTHROPIC_API_KEY: z.string().min(1),

  FIRECRAWL_API_KEY: z.string().min(1),

  HUB_ACCESS_TOKEN: z.string().min(8),

  INNGEST_EVENT_KEY: z.string().min(1),
  INNGEST_SIGNING_KEY: z.string().min(1),

  // Langfuse is optional: tracing is skipped entirely when these are unset
  // (no account configured). setupLangfuse() no-ops, LLM calls still run.
  LANGFUSE_PUBLIC_KEY: z.string().min(1).optional(),
  LANGFUSE_SECRET_KEY: z.string().min(1).optional(),
  LANGFUSE_BASE_URL: z.string().url().default("https://cloud.langfuse.com"),

  JOBHUNT_MAX_JOBS: z.coerce.number().int().positive().optional(),
  JOBHUNT_FIT_THRESHOLD: z.coerce.number().int().min(1).max(10).default(6),

  // Max concurrent evaluate/tailor child runs hitting Anthropic at once, enforced
  // ACCOUNT-WIDE by the Inngest `concurrency` key (scope:"account", key:"anthropic")
  // on evaluateJob/tailorJob — a cross-invocation cap, NOT an in-process limiter.
  // Each child makes its subgraph's LLM calls sequentially, so this ≈ concurrent
  // Anthropic calls. Keep at/under your Anthropic tier's headroom (Tier 1 Sonnet =
  // 50 RPM / 8k OTPM is tight; Tier 2 = 1k RPM / 90k OTPM).
  LLM_MAX_CONCURRENCY: z.coerce.number().int().positive().default(6),

  // Vercel Sandbox (job-hunt PDF render). Optional: absent locally until a
  // Vercel project + personal access token exist. The render node throws a
  // friendly error if VERCEL_TOKEN is unset at runtime. When deployed on
  // Vercel, OIDC (VERCEL_OIDC_TOKEN) is auto-detected and these can be unset.
  VERCEL_TOKEN: z.string().optional(),
  VERCEL_TEAM_ID: z.string().optional(),
  VERCEL_PROJECT_ID: z.string().optional(),
  RENDER_TYPST_VERSION: z.string().default("0.14.2"),

  // Browserbase (job-hunt LinkedIn board). Optional: the LinkedIn board is the
  // only Browserbase-sourced board and it fails SOFT — when the key/project are
  // unset, scrapeLinkedinListings logs and returns [], so the other (Firecrawl)
  // boards run normally. BROWSERBASE_PROXY="1" routes the session through a CH
  // residential proxy (paid plan only); unset = the free-tier default IP.
  BROWSERBASE_API_KEY: z.string().min(1).optional(),
  BROWSERBASE_PROJECT_ID: z.string().min(1).optional(),
  BROWSERBASE_PROXY: z.string().optional(),

  // Slack notifications are optional: when SLACK_BOT_TOKEN or SLACK_CHANNEL is
  // unset the notify helpers no-op (same contract as Langfuse). A bot token
  // (xoxb-…) with chat:write to the target channel; SLACK_CHANNEL is a channel
  // id (Cxxxx) or name (#job-hunt) the bot is a member of.
  SLACK_BOT_TOKEN: z.string().min(1).optional(),
  SLACK_CHANNEL: z.string().min(1).optional(),

  // Public origin of the deployed dashboard (e.g. https://hub.example.com), used
  // to build the "Open board" deep-link in Slack messages. Optional: the link is
  // omitted when unset. No trailing slash.
  HUB_BASE_URL: z.string().url().optional(),

  // Debug toggle (default ON): include a "scraped this run" listing in the
  // job-hunt digest AND relax the send gate so a run that scraped anything still
  // notifies. Set to "false" to revert to "notify only on opportunities/warnings".
  JOBHUNT_NOTIFY_SCRAPED_LIST: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

function load(): Env {
  if (cached) return cached;

  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  if (process.env.SKIP_ENV_VALIDATION === "true" && isBuildPhase) {
    cached = new Proxy({} as Env, {
      get: (_t, key: string) =>
        key.endsWith("_URL") ? "http://localhost" : "__build_placeholder__",
    });
    return cached;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const env = new Proxy({} as Env, {
  get(_target, key: string) {
    return load()[key as keyof Env];
  },
});
