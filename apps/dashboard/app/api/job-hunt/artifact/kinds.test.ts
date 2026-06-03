import { describe, it, expect } from "vitest";
import { KIND_TO_COLUMN, KIND_TO_FILENAME } from "./kinds";

describe("artifact kinds", () => {
  it("maps every kind to its Job storage column", () => {
    expect(KIND_TO_COLUMN).toEqual({
      resume: "resumeStoragePath",
      cover: "coverStoragePath",
      summary: "summaryStoragePath",
      diff: "diffStoragePath",
      "resume-pdf": "resumePdfStoragePath",
      "cover-pdf": "coverPdfStoragePath",
    });
  });

  it("maps every kind to a download filename", () => {
    expect(KIND_TO_FILENAME).toEqual({
      resume: "resume.yaml",
      cover: "cover.md",
      summary: "summary.md",
      diff: "diff.md",
      "resume-pdf": "resume.pdf",
      "cover-pdf": "cover.pdf",
    });
  });

  it("declares the same kinds in both maps", () => {
    expect(Object.keys(KIND_TO_FILENAME).sort()).toEqual(
      Object.keys(KIND_TO_COLUMN).sort(),
    );
  });
});
