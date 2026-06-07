import "server-only";
import { runTailorStep } from "../run-step";
import { REVISE_SUMMARY_SYSTEM } from "../prompts";
import {
  ResumeSummaryPatchSchema,
  type ResumeDraft,
  type ResumeMaster,
} from "../schemas";
import { PROFILE_RESUME_MASTER } from "../../profile";
import { MIN_SUMMARY_CHARS, MAX_BULLETS_PER_ROLE } from "./ats-check";
import type { TailorStateType } from "../state";

type Role = ResumeDraft["experience"][number];
type Engagement = NonNullable<Role["engagements"]>[number];
type Education = ResumeDraft["education"][number];

// Convert the master's keyed expert/knowledge skill map into the draft's
// {category, items}[] shape (names only, both tiers merged) — used to restore a
// resume that lost its whole skills section. The LIST carries names regardless of
// tier (the tier only governs prose framing, never list membership).
function masterSkillsToDraft(
  skills: ResumeMaster["skills"],
): ResumeDraft["skills"] {
  return Object.entries(skills).map(([category, tier]) => ({
    category,
    items: [...tier.expert, ...tier.knowledge],
  }));
}

// Match a draft role back to its master row by company+role (the draft preserves
// both), falling back to positional index if a rename slipped through.
function matchMasterRole(
  master: ResumeMaster,
  role: Role,
  index: number,
): Role | undefined {
  return (
    master.experience.find(
      (m) => m.company === role.company && m.role === role.role,
    ) ?? master.experience[index]
  );
}

// Same name-then-index fallback as matchMasterRole, but for an engagement within
// its master role. Without the index fallback a draft that renamed an engagement
// could never restore its bullets, leaving engagement_bullets_empty unfixed.
function matchMasterEngagement(
  masterRole: Role | undefined,
  eng: Engagement,
  index: number,
): Engagement | undefined {
  return (
    masterRole?.engagements?.find((m) => m.name === eng.name) ??
    masterRole?.engagements?.[index]
  );
}

function fixEngagement(
  eng: Engagement,
  master: Engagement | undefined,
): Engagement {
  let bullets = eng.bullets.slice(0, MAX_BULLETS_PER_ROLE); // overflow → truncate
  if (bullets.length === 0 && master && master.bullets.length > 0) {
    bullets = master.bullets.slice(0, MAX_BULLETS_PER_ROLE); // empty → restore
  }
  return { ...eng, bullets };
}

function fixRole(role: Role, master: Role | undefined): Role {
  let bullets = role.bullets
    ? role.bullets.slice(0, MAX_BULLETS_PER_ROLE) // overflow → truncate
    : role.bullets;
  // Repair each engagement (truncate / restore by name-or-index), then DROP any
  // that is still empty and unrecoverable — an emptied engagement with no master
  // match would otherwise keep firing engagement_bullets_empty for the whole loop.
  let engagements = role.engagements
    ?.map((eng, j) => fixEngagement(eng, matchMasterEngagement(master, eng, j)))
    .filter((eng) => eng.bullets.length > 0);

  // role_bullets_empty: no top-level bullets AND no engagements → restore from
  // master so the role isn't blank. Only ever fires on a role the draft itself
  // emptied (nothing tailored is overwritten). Assumes every master role has at
  // least one bullet or engagement (true for resume-master.yaml); a contentless
  // master role would simply stay empty and be rendered best-effort.
  const empty = (bullets?.length ?? 0) === 0 && (engagements?.length ?? 0) === 0;
  if (empty && master) {
    if (master.bullets && master.bullets.length > 0) {
      bullets = master.bullets.slice(0, MAX_BULLETS_PER_ROLE);
    } else if (master.engagements && master.engagements.length > 0) {
      engagements = master.engagements.map((m) => fixEngagement(m, m));
    }
  }

  return { ...role, bullets, engagements };
}

// education_missing_keys → restore the missing always-from-master keys; an entry
// that already has all four is returned untouched.
function fixEducationEntry(
  edu: Education,
  master: ResumeMaster,
  index: number,
): Education {
  if (edu.school && edu.degree && edu.start && edu.end) return edu;
  const m =
    master.education.find((e) => e.school === edu.school) ??
    master.education[index];
  return {
    ...edu,
    school: edu.school || m?.school || edu.school,
    degree: edu.degree || m?.degree || edu.degree,
    start: edu.start || m?.start || edu.start,
    end: edu.end || m?.end || edu.end,
  };
}

// Deterministically repair every STRUCTURAL ATS issue (bullet overflow, empty
// sections, missing always-from-master keys) WITHOUT an LLM. Pure + idempotent,
// so a checkpointer replay recomputes the same resume and a second loop pass is a
// no-op. Restores only never-translated facts (profile name/title/email, skill
// names, education school/degree/dates) and bullets the draft itself dropped — it
// never rewrites tailored prose.
function repairResumeStructure(
  resume: ResumeDraft,
  master: ResumeMaster,
): ResumeDraft {
  // profile_*_missing — these three are identical to the master in every language.
  const profile = { ...resume.profile };
  if (!profile.name) profile.name = master.profile.name;
  if (!profile.title) profile.title = master.profile.title;
  if (!profile.email) profile.email = master.profile.email;

  // experience_empty → restore the whole section; otherwise repair per role.
  const baseExperience =
    resume.experience.length > 0 ? resume.experience : master.experience;
  const experience = baseExperience.map((role, i) =>
    fixRole(role, matchMasterRole(master, role, i)),
  );

  // skills_empty → restore from master (names only, tiers merged).
  const skills =
    resume.skills.length > 0
      ? resume.skills
      : masterSkillsToDraft(master.skills);

  // education_empty → restore section; education_missing_keys → restore the keys.
  const education =
    resume.education.length > 0
      ? resume.education.map((edu, i) => fixEducationEntry(edu, master, i))
      : master.education;

  return { ...resume, profile, experience, skills, education };
}

export async function reviseNode(
  state: TailorStateType,
): Promise<Partial<TailorStateType>> {
  if (!state.draftResume || !state.atsCheckResult) {
    throw new Error(`[tailor/revise] ${state.jobId}: missing resume or ats result`);
  }

  // 1. Deterministic structural repair — fixes every ATS code except the prose
  //    `summary_too_short`, at zero LLM cost. Replaces the old full-resume Opus
  //    re-emit (the largest avoidable output cost in the tailor loop).
  let resume = repairResumeStructure(state.draftResume, PROFILE_RESUME_MASTER);

  // 2. summary_too_short: prefer the plan's already-written summaryRewrite (free,
  //    same source draft-resume copies from); only fall back to a minimal LLM
  //    patch if that is ALSO too short. The patch emits just { summary }, not the
  //    whole resume — that single-field output is the actual cost win.
  const codes = new Set(state.atsCheckResult.issues.map((i) => i.code));
  let summaryFix: "none" | "plan" | "llm" = "none";
  if (
    codes.has("summary_too_short") &&
    (resume.summary?.length ?? 0) < MIN_SUMMARY_CHARS
  ) {
    const planSummary = state.plan?.summaryRewrite ?? "";
    if (planSummary.length >= MIN_SUMMARY_CHARS) {
      resume = { ...resume, summary: planSummary };
      summaryFix = "plan";
    } else {
      const planCtx = state.plan
        ? {
            outputLanguage: state.plan.outputLanguage,
            summaryRewrite: state.plan.summaryRewrite,
          }
        : null;
      const patch = await runTailorStep({
        functionId: "jobhunt/tailor/revise-summary",
        systemInstructions: REVISE_SUMMARY_SYSTEM,
        userContent: [
          `<summary>\n${resume.summary ?? ""}\n</summary>`,
          `<plan>\n${JSON.stringify(planCtx)}\n</plan>`,
        ].join("\n\n"),
        schema: ResumeSummaryPatchSchema,
      });
      if (patch.summary && patch.summary.length >= MIN_SUMMARY_CHARS) {
        resume = { ...resume, summary: patch.summary };
        summaryFix = "llm";
      }
    }
  }

  // The back-edge sends this draft straight back to ats-check, which recomputes
  // atsCheckResult and decides whether to loop again, give up, or render — so
  // revise still owns no validation. Bump the bounded loop counter (replace-last
  // reducer, computed from state, replay-safe).
  const pass = (state.reviseCount ?? 0) + 1;
  console.log(
    `[tailor/revise] ${state.jobId} pass=${pass} repaired ${state.atsCheckResult.issues.length} issue(s) deterministically (summary=${summaryFix}) — re-checked by ats-check`,
  );

  return { draftResume: resume, reviseCount: pass };
}
