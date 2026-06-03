import "server-only";
import type { AtsCheckResult, ResumeDraft } from "../schemas";
import type { TailorStateType } from "../state";

const MIN_SUMMARY_CHARS = 50;
const MAX_BULLETS_PER_ROLE = 3;

export function runAtsValidation(
  resume: ResumeDraft | undefined,
): AtsCheckResult {
  const issues: AtsCheckResult["issues"] = [];

  if (!resume) {
    issues.push({
      code: "missing_resume",
      message: "draftResume is missing from state",
    });
    return { ok: false, issues };
  }

  if (!resume.profile?.name) {
    issues.push({ code: "profile_name_missing", message: "profile.name is empty" });
  }
  if (!resume.profile?.title) {
    issues.push({
      code: "profile_title_missing",
      message: "profile.title is empty",
    });
  }
  if (!resume.profile?.email) {
    issues.push({
      code: "profile_email_missing",
      message: "profile.email is empty",
    });
  }

  if (!resume.summary || resume.summary.length < MIN_SUMMARY_CHARS) {
    issues.push({
      code: "summary_too_short",
      message: `summary must be at least ${MIN_SUMMARY_CHARS} characters (got ${
        resume.summary?.length ?? 0
      })`,
    });
  }

  if (!resume.experience || resume.experience.length === 0) {
    issues.push({
      code: "experience_empty",
      message: "experience must contain at least one role",
    });
  } else {
    resume.experience.forEach((role, i) => {
      if (role.bullets && role.bullets.length > MAX_BULLETS_PER_ROLE) {
        issues.push({
          code: "role_bullets_overflow",
          message: `experience[${i}] (${role.company}) has ${role.bullets.length} bullets, max ${MAX_BULLETS_PER_ROLE}`,
        });
      }
      if (
        (role.bullets?.length ?? 0) === 0 &&
        (role.engagements?.length ?? 0) === 0
      ) {
        issues.push({
          code: "role_bullets_empty",
          message: `experience[${i}] (${role.company}) has no bullets and no engagements`,
        });
      }
      role.engagements?.forEach((eng, j) => {
        if (eng.bullets && eng.bullets.length > MAX_BULLETS_PER_ROLE) {
          issues.push({
            code: "engagement_bullets_overflow",
            message: `experience[${i}].engagements[${j}] (${eng.name}) has ${eng.bullets.length} bullets, max ${MAX_BULLETS_PER_ROLE}`,
          });
        }
        if (eng.bullets && eng.bullets.length === 0) {
          issues.push({
            code: "engagement_bullets_empty",
            message: `experience[${i}].engagements[${j}] (${eng.name}) has no bullets`,
          });
        }
      });
    });
  }

  if (!resume.skills || resume.skills.length === 0) {
    issues.push({
      code: "skills_empty",
      message: "skills must contain at least one category",
    });
  }

  if (!resume.education || resume.education.length === 0) {
    issues.push({
      code: "education_empty",
      message: "education must contain at least one entry",
    });
  } else {
    resume.education.forEach((edu, i) => {
      if (!edu.school || !edu.degree || !edu.start || !edu.end) {
        issues.push({
          code: "education_missing_keys",
          message: `education[${i}] is missing one of school/degree/start/end`,
        });
      }
    });
  }

  return { ok: issues.length === 0, issues };
}

export async function atsCheckNode(
  state: TailorStateType,
): Promise<Partial<TailorStateType>> {
  const result = runAtsValidation(state.draftResume);
  console.log(
    `[tailor/ats-check] ${state.jobId} ok=${result.ok} issues=${result.issues.length}`,
  );
  return { atsCheckResult: result };
}
