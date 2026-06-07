import "server-only";
import Browserbase from "@browserbasehq/sdk";
import { chromium, type Browser } from "playwright-core";
import { env } from "@hub/core/env";

/**
 * Browserbase session lifecycle for the LinkedIn board — the ONLY board scraped
 * via a remote headless browser instead of Firecrawl.
 *
 * Mirrors the render-sandbox singleton pattern (render/sandbox.ts): one warm
 * browser per process, memoized as a promise so concurrent first-callers await
 * the same creation, with every live browser tracked so disposeLinkedinSession()
 * tears down ALL of them (even an orphan from a retry). The session is created
 * lazily on first fetch in `scrape`, reused for the per-job JD fetches in
 * `deep-scrape`, then disposed — see deep-scrape's finally + inngest's catch.
 *
 * Env is read INSIDE the functions (never at module scope) so the Next.js
 * build-phase env placeholder (env.ts) never instantiates a real client.
 */

// A realistic desktop UA — LinkedIn's guest endpoints serve clean fragments to
// browser-like clients; a default headless UA is more likely to be challenged.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const GOTO_TIMEOUT_MS = 45_000;

let browserPromise: Promise<Browser> | undefined;
const liveBrowsers = new Set<Browser>();

/** True only when both Browserbase credentials are present. The LinkedIn board
 * is fail-soft: when this is false it skips entirely (the other boards run). */
export function linkedinConfigured(): boolean {
  return Boolean(env.BROWSERBASE_API_KEY && env.BROWSERBASE_PROJECT_ID);
}

async function createBrowser(): Promise<Browser> {
  const apiKey = env.BROWSERBASE_API_KEY;
  const projectId = env.BROWSERBASE_PROJECT_ID;
  if (!apiKey || !projectId) {
    throw new Error(
      "[linkedin] BROWSERBASE_API_KEY / BROWSERBASE_PROJECT_ID unset — cannot create a Browserbase session.",
    );
  }
  const bb = new Browserbase({ apiKey });
  // Residential proxy (geo CH) is opt-in via BROWSERBASE_PROXY=1 and needs a
  // paid plan; the free tier reaches LinkedIn's guest API on the default IP.
  const useProxy = env.BROWSERBASE_PROXY === "1";
  const session = await bb.sessions.create({
    projectId,
    ...(useProxy
      ? { proxies: [{ type: "browserbase" as const, geolocation: { country: "CH" } }] }
      : {}),
  });
  let browser: Browser;
  try {
    browser = await chromium.connectOverCDP(session.connectUrl);
  } catch (err) {
    // session.connectUrl carries the API key as a query param — a raw playwright
    // error would echo it into the dashboard-visible AgentRun.errorMessage. Throw
    // a sanitized message instead (redact.ts also value-sweeps the key as a net).
    throw new Error(
      `[linkedin] Browserbase connectOverCDP failed: ${err instanceof Error ? err.name : "connection error"}`,
    );
  }
  liveBrowsers.add(browser);
  return browser;
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    // Reset the memo on failure so a later call retries instead of resolving the
    // cached rejection forever (same guard as render/sandbox.ts).
    browserPromise = createBrowser().catch((err) => {
      browserPromise = undefined;
      throw err;
    });
  }
  return browserPromise;
}

/**
 * Fetch one URL through the shared Browserbase browser and return its rendered
 * HTML. A fresh page per call (closed in finally) on the shared context so
 * cookies set by the first request carry into later ones.
 */
export async function fetchHtml(
  url: string,
  opts: { waitMs?: number } = {},
): Promise<{ status: number | null; html: string }> {
  const browser = await getBrowser();
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = await context.newPage();
  try {
    // Override the UA at the CDP/protocol level so navigator.userAgent AND the
    // client hints (Sec-CH-UA) present as a real desktop Chrome. A bare
    // setExtraHTTPHeaders only sets the request header, leaving navigator.userAgent
    // as headless Chromium — which LinkedIn can still challenge. Best-effort: fall
    // back to the header if the CDP override isn't available on this transport.
    try {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.setUserAgentOverride", {
        userAgent: UA,
        acceptLanguage: "en-US,en;q=0.9",
      });
    } catch {
      await page.setExtraHTTPHeaders({
        "User-Agent": UA,
        "Accept-Language": "en-US,en;q=0.9",
      });
    }
    const resp = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: GOTO_TIMEOUT_MS,
    });
    if (opts.waitMs) await page.waitForTimeout(opts.waitMs).catch(() => {});
    return { status: resp?.status() ?? null, html: await page.content() };
  } finally {
    await page.close().catch(() => {});
  }
}

/** Close every live browser and reset the singleton (idempotent — safe to call
 * from deep-scrape's finally AND inngest's catch, in any order). */
export async function disposeLinkedinSession(): Promise<void> {
  const pending = browserPromise;
  browserPromise = undefined;
  // Drain any in-flight creation so its browser is tracked (or its failure
  // settled) before we close everything.
  if (pending) await pending.catch(() => {});
  const browsers = [...liveBrowsers];
  liveBrowsers.clear();
  await Promise.all(
    browsers.map((b) =>
      b.close().catch((err) =>
        console.error(
          "[linkedin] browser.close failed:",
          err instanceof Error ? err.message : err,
        ),
      ),
    ),
  );
}
