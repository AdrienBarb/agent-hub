import "server-only";
import type { ScrapedListing } from "../../state";
import type { BoardConfig } from "../../config";
import { fetchHtml, linkedinConfigured } from "./browserbase";
import { extractJdText } from "./parse";
import { httpStatusOf, makeWarning, type RunWarning } from "../../warnings";

// LinkedIn returns 25 cards per guest-search page; `start` paginates by 25.
const PAGE_SIZE = 25;
// A JD shorter than this is almost certainly an empty/blocked fragment, not a
// real posting — treat as a miss (null) so the row is excluded from evaluation,
// exactly like a Firecrawl deep-scrape miss leaves rawMarkdown null.
const MIN_JD_CHARS = 200;

function searchUrl(keywords: string, geoId: string, fTPR: string, start: number): string {
  const qs = new URLSearchParams({
    keywords,
    geoId,
    f_TPR: fTPR,
    start: String(start),
  });
  return `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${qs.toString()}`;
}

function detailUrl(slug: string): string {
  return `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${slug}`;
}

/**
 * Scrape the LinkedIn guest SEARCH endpoint into ScrapedListing[] (board markup
 * for parseLinkedinSearch). Fail-soft at every level: if Browserbase isn't
 * configured it logs and returns []; a failed page is logged and skipped. The
 * caller (scrapeNode) keeps these out of the Firecrawl outage guard, so a
 * LinkedIn outage never aborts the run.
 *
 * Because every page error is swallowed here (the shared Browserbase session
 * means a quota/credit error hits the FIRST page and recurs), this is the only
 * place that can surface a structured warning for it — returned alongside the
 * listings rather than thrown. Unconfigured/no-searches are intentional skips,
 * not warnings.
 */
export async function scrapeLinkedinListings(
  boardId: string,
  cfg: BoardConfig,
): Promise<{ listings: ScrapedListing[]; warnings: RunWarning[] }> {
  if (!linkedinConfigured()) {
    console.warn(
      "[scrape] linkedin: BROWSERBASE_API_KEY/PROJECT_ID unset — skipping board",
    );
    return { listings: [], warnings: [] };
  }
  const lk = cfg.linkedin;
  if (!lk || lk.searches.length === 0) {
    console.warn("[scrape] linkedin: no searches configured — skipping board");
    return { listings: [], warnings: [] };
  }

  const listings: ScrapedListing[] = [];
  const errors: unknown[] = [];
  for (const search of lk.searches) {
    for (let page = 0; page < lk.maxPages; page++) {
      const url = searchUrl(search.keywords, search.geoId, lk.fTPR, page * PAGE_SIZE);
      try {
        const { status, html } = await fetchHtml(url);
        if (status !== 200 || !html) {
          console.warn(`[scrape] linkedin ${url}: status=${status} — skipping page`);
          continue;
        }
        listings.push({ board: boardId, url, markdown: html });
        console.log(`[scrape] linkedin ${url}: ${html.length} chars`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        console.error(`[scrape] linkedin ${url} failed: ${message}`);
        errors.push(err);
      }
    }
  }

  const warnings: RunWarning[] = [];
  if (errors.length > 0) {
    const quota = errors.some((e) => {
      const s = httpStatusOf(e);
      return s === 429 || s === 402;
    });
    warnings.push(
      makeWarning(quota ? "browserbase_quota" : "linkedin_skipped", boardId, {
        count: errors.length,
      }),
    );
  }
  return { listings, warnings };
}

/**
 * Fetch one job's JD from the guest DETAIL endpoint and convert it to plain
 * text. Returns null on any failure or a too-short body — deep-scrape leaves
 * rawMarkdown null in that case, identical to a Firecrawl miss.
 */
export async function fetchLinkedinJd(slug: string): Promise<string | null> {
  try {
    const { status, html } = await fetchHtml(detailUrl(slug));
    if (status !== 200 || !html) {
      console.warn(`[deep-scrape] linkedin ${slug}: status=${status}`);
      return null;
    }
    const text = extractJdText(html);
    if (text.length < MIN_JD_CHARS) {
      console.warn(`[deep-scrape] linkedin ${slug}: JD too short (${text.length} chars)`);
      return null;
    }
    return text;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error(`[deep-scrape] linkedin ${slug} JD fetch failed: ${message}`);
    return null;
  }
}
