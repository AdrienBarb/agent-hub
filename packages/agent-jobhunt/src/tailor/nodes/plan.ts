import "server-only";
import { runTailorStep } from "../run-step";
import { PLAN_SYSTEM } from "../prompts";
import { PlanSchema, type Plan, type ResumeMaster } from "../schemas";
import { PROFILE_RESUME_MASTER } from "../../profile";
import type { TailorStateType } from "../state";

type Selection = Plan["selectedBullets"][number];

// First role/engagement in the master that actually has bullets. Used as a
// last-resort selection so a fully-hallucinated plan still yields a non-empty
// resume instead of failing the whole tailoring.
function firstUsableSelection(master: ResumeMaster): Selection | null {
  for (let r = 0; r < master.experience.length; r++) {
    const role = master.experience[r];
    if (!role) continue;
    if ((role.bullets ?? []).length > 0) {
      return { roleIndex: r, engagementIndex: null, bulletIndices: [0] };
    }
    const engagements = role.engagements ?? [];
    for (let e = 0; e < engagements.length; e++) {
      if ((engagements[e]?.bullets.length ?? 0) > 0) {
        return { roleIndex: r, engagementIndex: e, bulletIndices: [0] };
      }
    }
  }
  return null;
}

// Repair (don't reject) a plan whose indices the model hallucinated. Out-of-range
// roles/engagements drop their whole selection; out-of-range bullet indices are
// clamped away, falling back to the first real bullet so the role keeps ≥1. If
// every selection is unusable, synthesize one from the master. Returns the
// repaired selections plus human-readable warnings (never throws). Replaces the
// old all-or-nothing validator that failed the entire tailoring on one bad index.
function repairPlanIndices(
  plan: Plan,
  master: ResumeMaster,
): { selectedBullets: Selection[]; warnings: string[] } {
  const warnings: string[] = [];
  const repaired: Selection[] = [];

  plan.selectedBullets.forEach((sel, i) => {
    const role = master.experience[sel.roleIndex];
    if (!role) {
      warnings.push(
        `selectedBullets[${i}].roleIndex=${sel.roleIndex} out of range (master has ${master.experience.length} roles) — dropped`,
      );
      return;
    }

    let available: number;
    let where: string;
    if (sel.engagementIndex === null) {
      const roleBullets = role.bullets ?? [];
      if (roleBullets.length === 0) {
        warnings.push(
          `selectedBullets[${i}] role ${role.company}: no top-level bullets (engagementIndex was null) — dropped`,
        );
        return;
      }
      available = roleBullets.length;
      where = `role ${role.company}`;
    } else {
      const eng = role.engagements?.[sel.engagementIndex];
      if (!eng) {
        warnings.push(
          `selectedBullets[${i}] role ${role.company}: engagementIndex=${sel.engagementIndex} out of range (role has ${role.engagements?.length ?? 0} engagements) — dropped`,
        );
        return;
      }
      // Symmetric to the role branch above: an engagement with zero bullets has
      // no valid index to fall back to, so drop the whole selection rather than
      // letting the `valid.push(0)` fallback below fabricate an out-of-range [0].
      if (eng.bullets.length === 0) {
        warnings.push(
          `selectedBullets[${i}] engagement ${eng.name}: engagement has no bullets — dropped`,
        );
        return;
      }
      available = eng.bullets.length;
      where = `engagement ${eng.name}`;
    }

    const valid = sel.bulletIndices.filter((bi) => bi < available);
    const outOfRange = sel.bulletIndices.filter((bi) => bi >= available);
    if (outOfRange.length > 0) {
      warnings.push(
        `selectedBullets[${i}] ${where}: bulletIndices [${outOfRange.join(", ")}] out of range (has ${available}) — clamped`,
      );
    }
    if (valid.length === 0) {
      // Container exists and has bullets, but every requested index was bad.
      // Keep the first real bullet so the role still appears (≥1 bullet rule).
      warnings.push(
        `selectedBullets[${i}] ${where}: no in-range bulletIndices — fell back to [0]`,
      );
      valid.push(0);
    }

    repaired.push({ ...sel, bulletIndices: valid });
  });

  if (repaired.length === 0) {
    const fallback = firstUsableSelection(master);
    if (fallback) {
      warnings.push(
        `all ${plan.selectedBullets.length} selection(s) dropped — synthesized fallback ${JSON.stringify(fallback)}`,
      );
      repaired.push(fallback);
    } else {
      warnings.push(
        `all selections dropped and master has no usable bullets — proceeding with empty selection`,
      );
    }
  }

  return { selectedBullets: repaired, warnings };
}

export async function planNode(
  state: TailorStateType,
): Promise<Partial<TailorStateType>> {
  const userContent = [
    `<jd>\n${state.rawMarkdown}\n</jd>`,
    `<fit-details>\n${JSON.stringify(state.fitDetails)}\n</fit-details>`,
  ].join("\n\n");

  const plan = await runTailorStep({
    functionId: "jobhunt/tailor/plan",
    systemInstructions: PLAN_SYSTEM,
    userContent,
    schema: PlanSchema,
  });

  const { selectedBullets, warnings } = repairPlanIndices(
    plan,
    PROFILE_RESUME_MASTER,
  );
  if (warnings.length > 0) {
    console.warn(
      `[tailor/plan] ${state.jobId} repaired hallucinated indices: ${warnings.join("; ")}`,
    );
  }
  const repairedPlan: Plan = { ...plan, selectedBullets };

  console.log(
    `[tailor/plan] ${state.jobId} lang=${repairedPlan.outputLanguage} location="${repairedPlan.locationOverride}" bullets=${repairedPlan.selectedBullets.length}`,
  );

  return { plan: repairedPlan };
}
