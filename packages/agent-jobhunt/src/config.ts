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

const BoardConfigSchema = z.object({
  listing_urls: z.array(z.string().url()).default([]),
  firecrawl: FirecrawlBoardSchema.default({}),
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
