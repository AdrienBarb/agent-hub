// Map of allowed artifact kinds → the Job column holding the storage path.
// The client only ever sends a `kind`; the path is resolved server-side so a
// caller can never request an arbitrary storage object.
// Kept in its own module (no "server-only") so it stays importable from unit
// tests and the route handler alike.
export const KIND_TO_COLUMN = {
  resume: "resumeStoragePath",
  cover: "coverStoragePath",
  summary: "summaryStoragePath",
  diff: "diffStoragePath",
  "resume-pdf": "resumePdfStoragePath",
  "cover-pdf": "coverPdfStoragePath",
} as const;

// Download filename per kind — handed to createSignedUrl({ download }) so the
// browser saves the artifact under a sane name instead of inline-navigating to
// the opaque signed-URL path.
export const KIND_TO_FILENAME = {
  resume: "resume.yaml",
  cover: "cover.md",
  summary: "summary.md",
  diff: "diff.md",
  "resume-pdf": "resume.pdf",
  "cover-pdf": "cover.pdf",
} as const;

export type Kind = keyof typeof KIND_TO_COLUMN;
