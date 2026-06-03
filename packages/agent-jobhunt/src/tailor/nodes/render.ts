import "server-only";
import { stringify as yamlStringify } from "yaml";
import { db } from "@hub/core/db";
import { supabase } from "@hub/core/supabase";
import { STORAGE_BUCKET } from "../../manifest";
import { resumeDraftToYaml } from "../schemas";
import { checkAts, extractPdfText, getRenderer } from "../../render";
import type { TailorStateType } from "../state";

async function uploadPdf(path: string, bytes: Buffer): Promise<void> {
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, bytes, {
    upsert: true,
    contentType: "application/pdf",
  });
  if (error) {
    throw new Error(`upload ${path} failed: ${error.message}`);
  }
}

// Best-effort PDF render. Runs BEFORE persist, so it MUST NOT throw — a Typst
// or sandbox failure degrades to "tailored, no PDF" (text artifacts still
// persist) rather than failing the whole job. Records the ATS result either
// way (record-only, never a revise gate).
export async function renderNode(
  state: TailorStateType,
): Promise<Partial<TailorStateType>> {
  if (!state.draftResume || !state.draftCover) {
    console.error(`[tailor/render] ${state.jobId}: incomplete drafts, skipping render`);
    return {
      pdfAtsResult: { ok: false, charCount: 0, missingSections: ["incomplete-drafts"] },
    };
  }

  // Everything below is inside the try: this node MUST NOT throw (it runs
  // before persist), so even the DB read degrades to "no PDF" on failure.
  try {
    const job = await db.job.findUniqueOrThrow({
      where: { id: state.jobId },
      select: { id: true, runId: true },
    });
    if (!job.runId) {
      throw new Error(`job ${state.jobId} has no runId`);
    }

    const resumeYaml = yamlStringify(resumeDraftToYaml(state.draftResume));
    const coverMd = state.draftCover.markdown;

    const { resumePdf, coverPdf } = await getRenderer().render({
      jobId: job.id,
      resumeYaml,
      coverMd,
    });

    const ats = checkAts(await extractPdfText(resumePdf));

    const resumePdfPath = `${job.runId}/${job.id}/resume.pdf`;
    const coverPdfPath = `${job.runId}/${job.id}/cover.pdf`;
    await uploadPdf(resumePdfPath, resumePdf);
    await uploadPdf(coverPdfPath, coverPdf);

    if (!ats.ok) {
      console.warn(
        `[tailor/render] ${job.id} ATS warning: chars=${ats.charCount} missing=[${ats.missingSections.join(",")}]`,
      );
    }
    console.log(
      `[tailor/render] ${job.id} → ${resumePdfPath} (resume ${resumePdf.length}B, cover ${coverPdf.length}B)`,
    );

    return { resumePdfPath, coverPdfPath, pdfAtsResult: ats };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[tailor/render] ${state.jobId} failed (text artifacts still persist): ${message}`,
    );
    return {
      pdfAtsResult: { ok: false, charCount: 0, missingSections: ["render-failed"] },
    };
  }
}
