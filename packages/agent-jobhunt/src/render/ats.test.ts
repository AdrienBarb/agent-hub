import { describe, it, expect } from "vitest";
import { checkAts } from "./ats";

const pad = (n: number) => "x".repeat(n);

describe("checkAts", () => {
  it("flags text shorter than 500 chars as not ok", () => {
    const r = checkAts(`Experience Skills Education ${pad(100)}`);
    expect(r.charCount).toBeLessThan(500);
    expect(r.missingSections).toEqual([]);
    expect(r.ok).toBe(false);
  });

  it("lists missing sections and is not ok", () => {
    const r = checkAts(`Experience Skills ${pad(600)}`); // no Education
    expect(r.missingSections).toEqual(["Education"]);
    expect(r.ok).toBe(false);
  });

  it("is ok when long enough and all sections present", () => {
    const r = checkAts(`Experience Skills Education ${pad(600)}`);
    expect(r.charCount).toBeGreaterThanOrEqual(500);
    expect(r.missingSections).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("matches section names case-insensitively", () => {
    const r = checkAts(`experience skills education ${pad(600)}`);
    expect(r.missingSections).toEqual([]);
    expect(r.ok).toBe(true);
  });
});
