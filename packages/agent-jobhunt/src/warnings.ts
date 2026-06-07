/**
 * Structured run-warning collection — the single, typed sink for SOFT failures
 * that a run swallows but still completes through (a URL that won't scrape,
 * Firecrawl/Browserbase credit exhaustion, a failed evaluation/tailoring/render).
 *
 * Before this module those failures only reached `console.error` and vanished.
 * Nodes now emit `RunWarning[]` onto graph state (see state.ts `warnings`), and
 * the run-complete Slack digest reports them grouped by kind.
 *
 * Pure + dependency-free so it stays trivially unit-testable (warnings.test.ts).
 */

export type WarningKind =
  | "firecrawl_credit"
  | "firecrawl_rate_limit"
  | "scrape_failed"
  | "deepscrape_failed"
  | "db_write_failed"
  | "browserbase_quota"
  | "linkedin_skipped"
  | "eval_failed"
  | "tailor_failed"
  | "render_failed";

export interface RunWarning {
  kind: WarningKind;
  /** Board id or node name the warning originated from (e.g. "jobup", "render"). */
  source: string;
  /** Optional human detail — a batched summary or an affected job id. */
  detail?: string;
  /** Number of affected items, for batched warnings ("3 of 40 URLs failed"). */
  count?: number;
}

/** Build a warning, omitting empty optional fields so keys/equality stay stable. */
export function makeWarning(
  kind: WarningKind,
  source: string,
  opts: { detail?: string; count?: number } = {},
): RunWarning {
  const w: RunWarning = { kind, source };
  if (opts.detail !== undefined) w.detail = opts.detail;
  if (opts.count !== undefined) w.count = opts.count;
  return w;
}

/**
 * Stable key for the keyed graph-state reducer: same (kind, source, detail) ⇒
 * last-write-wins instead of append, so a fanned-out branch replayed from a
 * checkpoint can't double-count (mirrors the other keyed reducers in state.ts).
 */
export const keyOfWarning = (w: RunWarning): string =>
  `${w.kind}::${w.source}::${w.detail ?? ""}`;

/**
 * Best-effort HTTP status extraction across the SDK error shapes we see
 * (Firecrawl, Browserbase, fetch). Falls back to a 402/429 token in the message.
 */
export function httpStatusOf(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as Record<string, unknown>;
  const direct = e.status ?? e.statusCode;
  if (typeof direct === "number") return direct;
  const response = e.response as Record<string, unknown> | undefined;
  if (response && typeof response.status === "number") return response.status;
  const message = typeof e.message === "string" ? e.message : "";
  const m = message.match(/\b(402|429)\b/);
  return m ? Number(m[1]) : undefined;
}

/** Classify a single scrape-stage error into a warning kind. */
function classifyScrapeKind(err: unknown, fallback: WarningKind): WarningKind {
  const status = httpStatusOf(err);
  if (status === 402) return "firecrawl_credit";
  if (status === 429) return "firecrawl_rate_limit";
  return fallback;
}

/**
 * Bucket a batch of caught scrape errors by classified kind and return one
 * batched warning per kind (with a count). 402 ⇒ credit, 429 ⇒ rate-limit,
 * everything else ⇒ `fallbackKind` ("scrape_failed" for listings,
 * "deepscrape_failed" for JD fetches).
 */
export function summarizeScrapeErrors(
  source: string,
  errors: unknown[],
  fallbackKind: WarningKind = "scrape_failed",
  detail?: string,
): RunWarning[] {
  const byKind = new Map<WarningKind, number>();
  for (const err of errors) {
    const kind = classifyScrapeKind(err, fallbackKind);
    byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
  }
  // `detail` (e.g. "listing" vs "jd") keeps the keyed reducer from collapsing
  // the same phase-independent kind (firecrawl_credit/_rate_limit) emitted by
  // BOTH scrape phases into one key — which would drop one phase's count.
  // groupWarnings still aggregates by kind, so the digest total stays correct.
  return [...byKind.entries()].map(([kind, count]) =>
    makeWarning(kind, source, { count, detail }),
  );
}

/** Human-readable labels (with emoji) for the Slack digest. */
export const WARNING_LABELS: Record<WarningKind, string> = {
  firecrawl_credit: "💳 Firecrawl out of credit",
  firecrawl_rate_limit: "🐢 Firecrawl rate-limited",
  scrape_failed: "🔗 Listing pages failed to scrape",
  deepscrape_failed: "📄 Job pages failed to scrape",
  db_write_failed: "💾 Scraped JD failed to save (DB)",
  browserbase_quota: "💳 Browserbase quota/credit exhausted",
  linkedin_skipped: "⏭️ LinkedIn board skipped",
  eval_failed: "🧮 Job evaluations failed",
  tailor_failed: "✂️ Tailorings failed",
  render_failed: "🖨️ PDF renders failed",
};

export interface GroupedWarning {
  kind: WarningKind;
  label: string;
  /** Sum of `count` (absent count counts as 1 occurrence). */
  total: number;
  /** Distinct sources that contributed. */
  sources: string[];
}

/** Aggregate warnings by kind for the digest — sums counts, collects sources. */
export function groupWarnings(warnings: RunWarning[]): GroupedWarning[] {
  const byKind = new Map<WarningKind, { total: number; sources: Set<string> }>();
  for (const w of warnings) {
    const entry = byKind.get(w.kind) ?? { total: 0, sources: new Set<string>() };
    entry.total += w.count ?? 1;
    entry.sources.add(w.source);
    byKind.set(w.kind, entry);
  }
  return [...byKind.entries()].map(([kind, { total, sources }]) => ({
    kind,
    label: WARNING_LABELS[kind],
    total,
    sources: [...sources],
  }));
}
