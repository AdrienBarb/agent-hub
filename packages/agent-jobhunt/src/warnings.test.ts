import { describe, it, expect } from "vitest";
import {
  httpStatusOf,
  summarizeScrapeErrors,
  groupWarnings,
  makeWarning,
  keyOfWarning,
} from "./warnings";

describe("httpStatusOf", () => {
  it("reads err.status", () => {
    expect(httpStatusOf({ status: 402 })).toBe(402);
  });
  it("reads err.statusCode", () => {
    expect(httpStatusOf({ statusCode: 429 })).toBe(429);
  });
  it("reads err.response.status", () => {
    expect(httpStatusOf({ response: { status: 500 } })).toBe(500);
  });
  it("parses a 402/429 token out of the message", () => {
    expect(httpStatusOf(new Error("Request failed with status code 402"))).toBe(
      402,
    );
    expect(httpStatusOf(new Error("429 Too Many Requests"))).toBe(429);
  });
  it("returns undefined when no status is present", () => {
    expect(httpStatusOf(new Error("socket hang up"))).toBeUndefined();
    expect(httpStatusOf("not an object")).toBeUndefined();
    expect(httpStatusOf(null)).toBeUndefined();
  });
});

describe("summarizeScrapeErrors", () => {
  it("classifies 402→credit, 429→rate-limit, other→fallback with counts", () => {
    const errors = [
      { status: 402 },
      { status: 402 },
      { status: 429 },
      new Error("timeout"),
    ];
    const out = summarizeScrapeErrors("jobup", errors);
    expect(out).toContainEqual(
      makeWarning("firecrawl_credit", "jobup", { count: 2 }),
    );
    expect(out).toContainEqual(
      makeWarning("firecrawl_rate_limit", "jobup", { count: 1 }),
    );
    expect(out).toContainEqual(
      makeWarning("scrape_failed", "jobup", { count: 1 }),
    );
  });

  it("honors the fallbackKind for non-status errors", () => {
    const out = summarizeScrapeErrors(
      "deep-scrape",
      [new Error("x"), new Error("y")],
      "deepscrape_failed",
    );
    expect(out).toEqual([
      makeWarning("deepscrape_failed", "deep-scrape", { count: 2 }),
    ]);
  });

  it("returns nothing for an empty error batch", () => {
    expect(summarizeScrapeErrors("jobup", [])).toEqual([]);
  });

  it("threads a phase detail so cross-phase same-kind warnings keep distinct keys", () => {
    // A credit outage hits BOTH phases on the same board with the same
    // phase-independent kind (firecrawl_credit); without the detail their keys
    // would collide in the keyed reducer and one phase's count would be dropped.
    const listing = summarizeScrapeErrors(
      "jobup",
      [{ status: 402 }],
      "scrape_failed",
      "listing",
    );
    const jd = summarizeScrapeErrors(
      "jobup",
      [{ status: 402 }],
      "deepscrape_failed",
      "jd",
    );
    expect(listing[0].kind).toBe("firecrawl_credit");
    expect(jd[0].kind).toBe("firecrawl_credit");
    expect(keyOfWarning(listing[0])).not.toBe(keyOfWarning(jd[0]));
  });
});

describe("groupWarnings", () => {
  it("sums counts and collects distinct sources per kind", () => {
    const grouped = groupWarnings([
      makeWarning("scrape_failed", "jobup", { count: 3 }),
      makeWarning("scrape_failed", "swissdevjobs", { count: 2 }),
      makeWarning("render_failed", "render", { count: 1 }),
    ]);
    const scrape = grouped.find((g) => g.kind === "scrape_failed")!;
    expect(scrape.total).toBe(5);
    expect(scrape.sources.sort()).toEqual(["jobup", "swissdevjobs"]);
    expect(grouped.find((g) => g.kind === "render_failed")!.total).toBe(1);
  });

  it("counts an occurrence as 1 when count is absent", () => {
    const grouped = groupWarnings([
      makeWarning("eval_failed", "evaluate-one", { detail: "job1" }),
      makeWarning("eval_failed", "evaluate-one", { detail: "job2" }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].total).toBe(2);
  });
});

describe("keyOfWarning", () => {
  it("is stable for the same (kind, source, detail) so replays overwrite", () => {
    const a = makeWarning("eval_failed", "evaluate-one", { detail: "job1" });
    const b = makeWarning("eval_failed", "evaluate-one", { detail: "job1" });
    expect(keyOfWarning(a)).toBe(keyOfWarning(b));
  });
  it("differs when detail differs", () => {
    expect(
      keyOfWarning(makeWarning("eval_failed", "evaluate-one", { detail: "a" })),
    ).not.toBe(
      keyOfWarning(makeWarning("eval_failed", "evaluate-one", { detail: "b" })),
    );
  });
});
