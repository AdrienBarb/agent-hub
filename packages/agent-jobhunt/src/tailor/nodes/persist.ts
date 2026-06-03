import "server-only";
import { stringify as yamlStringify } from "yaml";
import { db } from "@hub/core/db";
import { supabase } from "@hub/core/supabase";
import { JobStatus, Prisma } from "@hub/core/prisma";
import { STORAGE_BUCKET } from "../../manifest";
import { resumeDraftToYaml } from "../schemas";
import type { TailorStateType } from "../state";

type Job = Awaited<ReturnType<typeof db.job.findUniqueOrThrow>>;

function buildSummaryMd(job: Job): string {
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Zurich",
  }).format(new Date());

  const salary = job.salary ?? "not disclosed";
  const city = job.city ?? "";
  const fitScore = job.fitScore?.toString() ?? "n/a";
  const reasoning = job.fitReasoning ?? "(no reasoning recorded)";

  const frontmatter = yamlStringify({
    slug: job.slug,
    title: job.title,
    company: job.company ?? "",
    city,
    salary,
    fit_score: fitScore,
    url: job.url,
    tailored_at: today,
    run_id: job.runId,
  });

  return `---
${frontmatter}---

# ${job.title} — Fit ${fitScore}/10

**${job.company ?? ""}** · ${city} · ${salary}

## Apply
${job.url}

## Why this matched
${reasoning}

## Files
- \`resume.yaml\` — tailored resume source
- \`cover.md\` — tailored cover letter source
- \`diff.md\` — audit trail vs master
`;
}

function buildDiffMd(state: TailorStateType, job: Job): string {
  const plan = state.plan;
  const ats = state.atsCheckResult;

  const planLines = plan
    ? [
        `- Location override: ${plan.locationOverride}`,
        `- Cover hook: ${plan.coverHook}`,
        "- Bullet selections:",
        ...plan.selectedBullets.map((sel) => {
          const where =
            sel.engagementIndex === null
              ? `experience[${sel.roleIndex}]`
              : `experience[${sel.roleIndex}].engagements[${sel.engagementIndex}]`;
          return `  - ${where}: indices ${sel.bulletIndices.join(", ")}`;
        }),
      ].join("\n")
    : "(no plan recorded)";

  const atsLines = ats
    ? [
        `- ok: ${ats.ok}`,
        `- issues (${ats.issues.length}):`,
        ...ats.issues.map((i) => `  - [${i.code}] ${i.message}`),
      ].join("\n")
    : "(no ATS result recorded)";

  return `# Tailor diff — ${job.title} @ ${job.company ?? "?"}

## Plan
${planLines}

## ATS check
${atsLines}

## Humanizer pass
Inlined into draft prompts. See \`prompts.ts\` for the rule set the model was instructed to apply: no em-dashes, no AI vocabulary, no compound coinages, varied sentence rhythm, first-person where natural.
`;
}

async function uploadText(
  path: string,
  content: string,
  contentType: string,
): Promise<void> {
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, content, {
    upsert: true,
    contentType,
  });
  if (error) {
    throw new Error(`upload ${path} failed: ${error.message}`);
  }
}

export async function persistNode(
  state: TailorStateType,
): Promise<Partial<TailorStateType>> {
  if (!state.draftResume || !state.draftCover) {
    throw new Error(`[tailor/persist] ${state.jobId}: incomplete drafts`);
  }

  const job = await db.job.findUniqueOrThrow({ where: { id: state.jobId } });
  if (!job.runId) {
    throw new Error(`[tailor/persist] ${state.jobId}: job has no runId`);
  }

  const resumeYaml = yamlStringify(resumeDraftToYaml(state.draftResume));
  const coverMd = state.draftCover.markdown;
  const summaryMd = buildSummaryMd(job);
  const diffMd = buildDiffMd(state, job);

  const resumePath = `${job.runId}/${job.id}/resume.yaml`;
  const coverPath = `${job.runId}/${job.id}/cover.md`;
  const summaryPath = `${job.runId}/${job.id}/summary.md`;
  const diffPath = `${job.runId}/${job.id}/diff.md`;

  await uploadText(resumePath, resumeYaml, "application/x-yaml");
  await uploadText(coverPath, coverMd, "text/markdown");
  await uploadText(summaryPath, summaryMd, "text/markdown");
  await uploadText(diffPath, diffMd, "text/markdown");

  const tailorDetails: Prisma.InputJsonValue = {
    plan: state.plan ?? null,
    atsCheckResult: state.atsCheckResult ?? null,
  };

  await db.job.update({
    where: { id: state.jobId },
    data: {
      resumeStoragePath: resumePath,
      coverStoragePath: coverPath,
      summaryStoragePath: summaryPath,
      diffStoragePath: diffPath,
      tailoredAt: new Date(),
      tailorDetails,
      status: JobStatus.tailored,
    },
  });

  console.log(
    `[tailor/persist] ${state.jobId} → status=tailored paths=${resumePath}`,
  );

  return { finalStatus: JobStatus.tailored };
}
