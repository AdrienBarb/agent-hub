import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { linkedin, parseLinkedinSearch, extractJdText } from "./parse";

// Real guest-API responses captured live via Browserbase (scripts/test-
// browserbase-linkedin.ts). Committed so the parser is tested against actual
// LinkedIn markup and fails loudly if that markup ever drifts.
const searchHtml = readFileSync(
  new URL("./__fixtures__/search.html", import.meta.url),
  "utf8",
);
const detailHtml = readFileSync(
  new URL("./__fixtures__/detail.html", import.meta.url),
  "utf8",
);

describe("parseLinkedinSearch", () => {
  const jobs = parseLinkedinSearch(searchHtml);

  it("parses all 10 cards in the guest-search fragment", () => {
    expect(jobs.length).toBe(10);
  });

  it("is exposed as the linkedin BoardAdapter (id + parse)", () => {
    expect(linkedin.id).toBe("linkedin");
    expect(linkedin.parse(searchHtml).length).toBe(10);
  });

  it("emits the HUMAN apply URL, never the guest endpoint", () => {
    for (const j of jobs) {
      expect(j.url).toMatch(/^https:\/\/www\.linkedin\.com\/jobs\/view\/\d+$/);
      expect(j.url).not.toContain("jobs-guest");
    }
  });

  it("uses the numeric job id as the slug, unique per card", () => {
    for (const j of jobs) {
      expect(j.board).toBe("linkedin");
      expect(j.slug).toMatch(/^\d+$/);
      expect(j.url.endsWith(`/${j.slug}`)).toBe(true);
    }
    expect(new Set(jobs.map((j) => j.slug)).size).toBe(jobs.length);
  });

  it("extracts non-empty title + company for every card", () => {
    for (const j of jobs) {
      expect(j.title.length).toBeGreaterThan(0);
      expect(j.title).not.toContain("<");
      expect(j.company && j.company.length).toBeGreaterThan(0);
    }
  });

  it("never stores country-level 'Switzerland' as a city (null instead)", () => {
    for (const j of jobs) {
      if (j.city !== null) expect(j.city).not.toMatch(/^switzerland$/i);
    }
    // at least one card in the fixture is country-level → nulled
    expect(jobs.some((j) => j.city === null)).toBe(true);
  });
});

describe("extractJdText", () => {
  const text = extractJdText(detailHtml);

  it("returns a substantial plain-text JD with no HTML tags", () => {
    expect(text.length).toBeGreaterThan(500);
    expect(text).not.toContain("<div");
    expect(text).not.toContain("show-more-less");
  });

  it("contains real JD prose from the fixture", () => {
    expect(text.toLowerCase()).toContain("proton");
  });
});
