/**
 * Smoke-test: can a Browserbase session (FREE tier, no proxies) actually reach
 * LinkedIn job listings? This is the empirical answer to "does Browserbase's
 * default cloud IP get past LinkedIn's anti-bot, or do we need paid proxies?"
 *
 *   pnpm add -D -w @browserbasehq/sdk playwright-core      # one-time
 *   dotenv -e .env.local -- tsx scripts/test-browserbase-linkedin.ts
 *
 * Needs BROWSERBASE_API_KEY + BROWSERBASE_PROJECT_ID in .env.local.
 *
 * Three independent probes in ONE session (so they share the 1 free browser-hr):
 *   A. Rendered public jobs page  → what a real browser buys you. Count cards.
 *   B. Guest search API fragment  → the cheap static-HTML endpoint. Count cards.
 *   C. Guest detail endpoint      → the JD body for one job id. Check length.
 *
 * For each probe we print the HTTP status (200 / 429 / 999 / 403 = the verdict)
 * + a card/char count + save HTML & a screenshot to ./tmp-browserbase/ as proof.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import Browserbase from "@browserbasehq/sdk";
import { chromium, type Page } from "playwright-core";

const OUT_DIR = "./tmp-browserbase";

const KEYWORDS = "full-stack developer";
const LOCATION = "Switzerland";
const F_TPR = "r86400"; // posted in last 24h — matches the daily cron sweep

const RENDERED_URL =
  `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(KEYWORDS)}` +
  `&location=${encodeURIComponent(LOCATION)}&f_TPR=${F_TPR}`;
const GUEST_SEARCH_URL =
  `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?` +
  `keywords=${encodeURIComponent(KEYWORDS)}&location=${encodeURIComponent(LOCATION)}` +
  `&f_TPR=${F_TPR}&start=0`;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function probe(
  page: Page,
  label: string,
  url: string,
  countInPage: () => Promise<number>,
): Promise<{ status: number | null; count: number; html: string }> {
  console.log(`\n── ${label} ──\n${url}`);
  try {
    const resp = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    const status = resp?.status() ?? null;
    // give client-rendered cards a moment; harmless for the static fragments
    await page.waitForTimeout(2500).catch(() => {});
    const count = await countInPage().catch(() => 0);
    const html = await page.content().catch(() => "");
    const verdict =
      status === 200 && count > 0
        ? "✓ OK"
        : status === 200
          ? "⚠ 200 but 0 cards (login wall / markup change?)"
          : `✗ BLOCKED (status ${status})`;
    console.log(`status=${status}  cards/len=${count}  → ${verdict}`);
    return { status, count, html };
  } catch (e) {
    console.error(`✗ ${label} threw: ${e instanceof Error ? e.message : e}`);
    return { status: null, count: 0, html: "" };
  }
}

async function main() {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;
  if (!apiKey || !projectId) {
    console.error(
      "Missing BROWSERBASE_API_KEY and/or BROWSERBASE_PROJECT_ID in .env.local",
    );
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const bb = new Browserbase({ apiKey });
  console.log("[browserbase] creating session (no proxies — free-tier test) …");
  const session = await bb.sessions.create({ projectId });
  console.log(`[browserbase] session ${session.id} → live view in dashboard`);

  const browser = await chromium.connectOverCDP(session.connectUrl);
  try {
    const context = browser.contexts()[0] ?? (await browser.newContext());
    await context.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.setExtraHTTPHeaders({ "User-Agent": UA });

    // ---- A. rendered public jobs page ----
    const a = await probe(page, "A · RENDERED public jobs page", RENDERED_URL, () =>
      page.evaluate(() => {
        const sels = [
          "ul.jobs-search__results-list > li",
          "div.base-card",
          ".job-search-card",
          ".base-search-card",
        ];
        return Math.max(
          ...sels.map((s) => document.querySelectorAll(s).length),
          0,
        );
      }),
    );
    writeFileSync(`${OUT_DIR}/a-rendered.html`, a.html);
    await page
      .screenshot({ path: `${OUT_DIR}/a-rendered.png`, fullPage: true })
      .catch(() => {});

    // ---- B. guest search API fragment ----
    const b = await probe(page, "B · GUEST search API", GUEST_SEARCH_URL, () =>
      page.evaluate(() => {
        const sels = ["li", "div.base-card", ".base-search-card", ".job-search-card"];
        return Math.max(...sels.map((s) => document.querySelectorAll(s).length), 0);
      }),
    );
    writeFileSync(`${OUT_DIR}/b-guest-search.html`, b.html);

    // ---- C. guest detail endpoint (derive one job id from B) ----
    const jobId = b.html.match(/jobs-guest\/jobs\/api\/jobPosting\/(\d+)/)?.[1]
      ?? b.html.match(/currentJobId=(\d+)/)?.[1]
      ?? b.html.match(/data-entity-urn="urn:li:jobPosting:(\d+)"/)?.[1]
      ?? b.html.match(/\/jobs\/view\/(\d+)/)?.[1];
    if (jobId) {
      const detailUrl = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;
      const c = await probe(page, `C · GUEST detail (job ${jobId})`, detailUrl, () =>
        page.evaluate(() => document.body?.innerText.trim().length ?? 0),
      );
      writeFileSync(`${OUT_DIR}/c-guest-detail.html`, c.html);
    } else {
      console.log("\n── C · GUEST detail ──\nskipped: no job id found in probe B HTML");
    }

    console.log(`\n=== artifacts in ${OUT_DIR}/ (open *.png / *.html to inspect) ===`);
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
