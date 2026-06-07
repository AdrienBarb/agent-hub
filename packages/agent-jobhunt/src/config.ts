import { z } from "zod";
import rawConfig from "../config.json" with { type: "json" };

/**
 * Per-board Firecrawl scrape settings. Every field has a safe default so a board
 * can omit the whole `firecrawl` block (or any single field) without breaking
 * the listing scrape. `timeout` caps a single listing fetch so one hung board
 * page can't stall the scrape node — deep-scrape already caps its JD fetches at
 * 60s; listings get the same ceiling here.
 */
const FirecrawlBoardSchema = z.object({
  waitFor: z.number().int().nonnegative().default(12_000),
  onlyMainContent: z.boolean().default(false),
  timeout: z.number().int().positive().default(60_000),
});

/**
 * LinkedIn board config — drives the Browserbase guest-API scraper instead of
 * Firecrawl. `searches` is fanned out (one guest-search request per entry ×
 * page); `geoId` is a LinkedIn location id (106693272 = Switzerland); `fTPR`
 * is the "date posted" window (r86400 = last 24h, matching the daily cron).
 */
const LinkedinSearchSchema = z.object({
  keywords: z.string().min(1),
  geoId: z.string().min(1),
});

const LinkedinConfigSchema = z.object({
  searches: z.array(LinkedinSearchSchema).default([]),
  fTPR: z.string().default("r86400"),
  // Per-search page count (each page = 25 cards). The overall job cap is the
  // global JOBHUNT_MAX_JOBS applied in parseNode — no separate per-board limit.
  maxPages: z.number().int().positive().default(1),
});

export type LinkedinConfig = z.infer<typeof LinkedinConfigSchema>;

const BoardConfigSchema = z.object({
  // Which scraper drives this board. Firecrawl boards use `listing_urls` +
  // `firecrawl`; the `linkedin` source uses the `linkedin` block via Browserbase.
  source: z.enum(["firecrawl", "linkedin"]).default("firecrawl"),
  listing_urls: z.array(z.string().url()).default([]),
  firecrawl: FirecrawlBoardSchema.default({}),
  linkedin: LinkedinConfigSchema.optional(),
});

export type BoardConfig = z.infer<typeof BoardConfigSchema>;

/**
 * Boards keyed by id, zod-parsed from config.json. Parsing (instead of reading
 * the raw JSON inference) means a board that omits `firecrawl` — or any field in
 * it — fills with defaults rather than producing a fragile literal type that
 * breaks typecheck and a runtime `undefined.waitFor` the moment a second board
 * is added (see B1). The config `boardId` key MUST equal the adapter key in
 * `boards/index.ts`.
 */
export const boardConfigs: Record<string, BoardConfig> = z
  .record(z.string(), BoardConfigSchema)
  .parse(rawConfig.boards);
