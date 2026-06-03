import "server-only";
import type { Score } from "./schemas";

// How far a SINGLE critique pass may pull a score down. A tail-risk limiter on
// a pathological adversarial swing (8 -> 3 becomes 8 -> 5); it does NOT, on its
// own, stop a small threshold-crossing downgrade — the confidence gate below
// does that. Never lets the final dip under the schema floor of 1.
export const MAX_DOWNGRADE_DELTA = 3;

export type ReconcileDecision =
  | "no-critique"
  | "upgrade"
  | "upgrade-rejected-low-conf"
  | "downgrade"
  | "downgrade-clamped"
  | "downgrade-rejected-low-conf"
  | "downgrade-rejected-needs-high-conf";

export interface ReconcileResult {
  /** The accepted score to persist (always internally consistent: the stored
   *  reasoning matches the stored number). */
  score: Score;
  decision: ReconcileDecision;
  /** final.fitScore - original.fitScore (0 when the critique was rejected). */
  delta: number;
}

/**
 * Reconcile an adversarial critique against the original score with a TIERED
 * confidence gate. Asymmetric on purpose: a wrongly-demoted job silently drops
 * below the fit threshold and the candidate never sees it (costly, invisible),
 * whereas a wrongly-promoted job costs one wasted tailoring run (cheap, visible).
 * So downgrades are distrusted, upgrades trusted.
 *
 * Pure + deterministic over its two inputs. The caller MUST pass the immutable
 * pre-critique `original` (written once by scoreNode) and the raw critique
 * `revised` (written once by critiqueNode) — never a value this function has
 * already reconciled — so a checkpointer replay recomputes the same result
 * instead of double-applying the clamp. See evaluator/persist.ts.
 */
export function reconcileScore(
  original: Score,
  revised: Score | undefined,
  threshold: number,
): ReconcileResult {
  if (!revised) {
    return { score: original, decision: "no-critique", delta: 0 };
  }

  // Defensive: keep the revised number inside the schema's 1-10 band even if
  // the schema is ever relaxed (native structured output guarantees it today).
  const revisedFit = Math.min(10, Math.max(1, revised.fitScore));

  // Upgrades / ties: trust the critique. A "low"-confidence push isn't credible
  // in EITHER direction, so a low-confidence upgrade is rejected too (cheap
  // insurance against a garbage upgrade manufacturing a false positive).
  if (revisedFit >= original.fitScore) {
    if (revised.confidence === "low") {
      return { score: original, decision: "upgrade-rejected-low-conf", delta: 0 };
    }
    return {
      score: { ...revised, fitScore: revisedFit },
      decision: "upgrade",
      delta: revisedFit - original.fitScore,
    };
  }

  // Downgrade — the dangerous direction.
  const crossesThreshold =
    original.fitScore >= threshold && revisedFit < threshold;

  // A downgrade that flips evaluated -> not_a_fit (terminal drop) demands HIGH
  // confidence. A downgrade that stays on the same side of the threshold is
  // low-stakes, so anything but "low" is enough.
  if (crossesThreshold && revised.confidence !== "high") {
    return {
      score: original,
      decision: "downgrade-rejected-needs-high-conf",
      delta: 0,
    };
  }
  if (!crossesThreshold && revised.confidence === "low") {
    return { score: original, decision: "downgrade-rejected-low-conf", delta: 0 };
  }

  const floor = Math.max(1, original.fitScore - MAX_DOWNGRADE_DELTA);
  const acceptedFit = Math.max(revisedFit, floor);

  if (acceptedFit === revisedFit) {
    // Not clamped: take the revised score whole — its reasoning matches its
    // number.
    return {
      score: { ...revised, fitScore: revisedFit },
      decision: "downgrade",
      delta: revisedFit - original.fitScore,
    };
  }

  // Clamped: the kept number no longer matches the critique's reasoning (which
  // argued for a steeper drop). Use the ORIGINAL reasoning for the capped number
  // so fitReasoning stays consistent, and keep the critique's argument both
  // inline and in the audit trail (fitDetails.critique.raw).
  return {
    score: {
      fitScore: acceptedFit,
      confidence: revised.confidence,
      reasoning: `${original.reasoning} [critique argued lower (${revisedFit}/10): ${revised.reasoning}]`,
    },
    decision: "downgrade-clamped",
    delta: acceptedFit - original.fitScore,
  };
}
