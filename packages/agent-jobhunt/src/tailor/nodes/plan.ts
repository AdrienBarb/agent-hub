import "server-only";
import { runTailorStep } from "../run-step";
import { PLAN_SYSTEM } from "../prompts";
import { PlanSchema, type Plan, type ResumeYaml } from "../schemas";
import { PROFILE_RESUME_MASTER } from "../../profile";
import type { TailorStateType } from "../state";

function validatePlanIndices(plan: Plan, master: ResumeYaml): string[] {
  const errors: string[] = [];
  plan.selectedBullets.forEach((sel, i) => {
    const role = master.experience[sel.roleIndex];
    if (!role) {
      errors.push(
        `selectedBullets[${i}].roleIndex=${sel.roleIndex} out of range (master has ${master.experience.length} roles)`,
      );
      return;
    }
    if (sel.engagementIndex === null) {
      const roleBullets = role.bullets ?? [];
      if (roleBullets.length === 0) {
        errors.push(
          `selectedBullets[${i}] role ${role.company}: role has no top-level bullets (use engagementIndex instead)`,
        );
        return;
      }
      sel.bulletIndices.forEach((bi) => {
        if (bi >= roleBullets.length) {
          errors.push(
            `selectedBullets[${i}] role ${role.company}: bulletIndex ${bi} out of range (role has ${roleBullets.length} bullets)`,
          );
        }
      });
    } else {
      const eng = role.engagements?.[sel.engagementIndex];
      if (!eng) {
        errors.push(
          `selectedBullets[${i}] role ${role.company}: engagementIndex=${sel.engagementIndex} out of range (role has ${role.engagements?.length ?? 0} engagements)`,
        );
        return;
      }
      sel.bulletIndices.forEach((bi) => {
        if (bi >= eng.bullets.length) {
          errors.push(
            `selectedBullets[${i}] engagement ${eng.name}: bulletIndex ${bi} out of range (engagement has ${eng.bullets.length} bullets)`,
          );
        }
      });
    }
  });
  return errors;
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

  const errors = validatePlanIndices(plan, PROFILE_RESUME_MASTER);
  if (errors.length > 0) {
    throw new Error(
      `[tailor/plan] ${state.jobId} hallucinated indices: ${errors.join("; ")}`,
    );
  }

  console.log(
    `[tailor/plan] ${state.jobId} location="${plan.locationOverride}" bullets=${plan.selectedBullets.length}`,
  );

  return { plan };
}
