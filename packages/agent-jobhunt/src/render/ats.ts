import "server-only";
import { extractText } from "unpdf";

// A `type` alias (not interface) so it stays assignable to Prisma's
// InputJsonValue when written to Job.renderDetails — interfaces are rejected
// there (no implicit index signature). Matches the zod-inferred types used in
// tailorDetails.
export type AtsResult = {
  ok: boolean;
  charCount: number;
  missingSections: string[];
};

// Standard section names an ATS parser expects in the extracted text layer.
// Mirrors the legacy render.sh heuristic (>500 chars + these keywords).
const REQUIRED_SECTIONS = ["Experience", "Skills", "Education"] as const;
const MIN_CHARS = 500;

/** Extract the text layer from PDF bytes (digitally-born → no OCR needed). */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  // Copy into a fresh Uint8Array: pdf.js may detach/transfer the buffer.
  const { text } = await extractText(new Uint8Array(bytes), {
    mergePages: true,
  });
  return text;
}

/** Record-only ATS parseability check (never blocks the pipeline). */
export function checkAts(text: string): AtsResult {
  const charCount = text.length;
  const lower = text.toLowerCase();
  const missingSections = REQUIRED_SECTIONS.filter(
    (s) => !lower.includes(s.toLowerCase()),
  );
  return {
    ok: charCount >= MIN_CHARS && missingSections.length === 0,
    charCount,
    missingSections,
  };
}
