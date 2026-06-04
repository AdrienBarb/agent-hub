import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import { anthropic, MODELS } from "@hub/core/llm";
import { db } from "@hub/core/db";
import { JobStatus } from "@hub/core/prisma";
import type { JobHuntStateType } from "../state";

// Cross-board dedup. The same real-world job is cross-posted on multiple boards
// (jobup, jobs.ch, …) under different board slugs, so the unique([board,slug])
// constraint never catches it. This node runs AFTER deep-scrape (full JD in
// rawMarkdown) and BEFORE the eval/tailor fan-outs: it groups the run's jobs by
// company, asks an LLM per pair whether they are the SAME posting, and marks the
// losers status=duplicate. A duplicate falls out of dispatch-evaluations
// (status:"new") and dispatch-tailorings (status:"evaluated") for free — no
// dispatch changes needed.
//
// Governing principle: a FALSE MERGE (fusing two distinct jobs) hides a real
// opening and is the costly error; a surviving duplicate is the cheap, tolerated
// error. So the adjudicator is precision-biased and the merge is anchor-based.

const MAX_GROUP = 12;
const JD_CHARS = 2500;

// Higher = better canonical. The most-advanced-status job in a confirmed group
// becomes the canonical so already-processed work (e.g. a job tailored on a
// prior run, re-listed today on another board) is never redone.
const STATUS_RANK: Record<string, number> = {
  tailored: 5,
  applied: 4,
  evaluated: 3,
  not_a_fit: 2,
  new: 1,
};

type DedupJob = {
  id: string;
  company: string | null;
  title: string;
  city: string | null;
  rawMarkdown: string | null;
  status: JobStatus;
  firstSeenAt: Date;
};

function normalizeCompany(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // strip diacritics (combining marks)
    .toLowerCase()
    .replace(/\bswitzerland\b/g, "")
    .replace(/\b(gmbh|ag|sa|sarl|ltd|llc|inc)\b/g, "") // legal suffixes (input already de-accented)
    .replace(/[^a-z0-9]+/g, " ") // punctuation → space
    .replace(/\s+/g, " ")
    .trim();
}

const AdjudicationSchema = z.object({
  same: z.boolean(),
  reason: z.string(),
});

const ADJUDICATE_SYSTEM = `You compare two job postings and decide whether they are THE SAME job posting — the same single open position at the same employer — possibly cross-posted on different job boards or written in different languages.

Answer same=true ONLY if you are confident they are the identical position: same employer, same role and responsibilities, same location. If they differ in role, team, seniority, or location — or if you are at all uncertain — answer same=false. When in doubt, answer same=false.

It is far worse to wrongly declare two DIFFERENT jobs the same (that hides a real opening) than to miss a true duplicate. Bias toward same=false.

Give a one-sentence reason.`;

function describe(job: DedupJob, tag: string): string {
  return [
    `${tag}:`,
    `- Title: ${job.title}`,
    `- Company: ${job.company ?? "(unknown)"}`,
    `- City: ${job.city ?? "(unknown)"}`,
    `- Description:`,
    `<${tag}>`,
    (job.rawMarkdown ?? "").slice(0, JD_CHARS),
    `</${tag}>`,
  ].join("\n");
}

type Adjudication = z.infer<typeof AdjudicationSchema>;

// One LLM call per candidate pair. We inline generateObject (rather than reuse
// evaluator/run-step.ts) on purpose: that helper prepends the candidate's
// PROFILE_COMBINED, but a same-vs-different posting comparison must NOT be biased
// by who the candidate is. temperature:0 maximizes adjudication determinism.
// Best-effort: any failure → { same:false } (leave the pair unmerged), never throws.
async function adjudicateSamePair(a: DedupJob, b: DedupJob): Promise<Adjudication> {
  try {
    const result = await generateObject({
      model: anthropic(MODELS.evaluator),
      temperature: 0,
      schema: AdjudicationSchema,
      allowSystemInMessages: true,
      providerOptions: {
        anthropic: { structuredOutputMode: "outputFormat" },
      },
      messages: [
        {
          role: "system",
          content: ADJUDICATE_SYSTEM,
          providerOptions: {
            anthropic: { cacheControl: { type: "ephemeral" } },
          },
        },
        {
          role: "user",
          content: `${describe(a, "jobA")}\n\n${describe(b, "jobB")}`,
        },
      ],
      experimental_telemetry: {
        isEnabled: true,
        functionId: "jobhunt/dedupe/adjudicate",
        recordInputs: false,
        recordOutputs: false,
      },
    });
    return result.object;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error(`[dedupe] adjudication failed for ${a.id} vs ${b.id}: ${message}`);
    return { same: false, reason: `adjudication error: ${message}` };
  }
}

export async function dedupeNode(
  state: JobHuntStateType,
): Promise<Partial<JobHuntStateType>> {
  try {
    const candidates = (
      await db.job.findMany({
        where: {
          runId: state.runId,
          status: { not: JobStatus.duplicate },
          rawMarkdown: { not: null },
        },
        select: {
          id: true,
          company: true,
          title: true,
          city: true,
          rawMarkdown: true,
          status: true,
          firstSeenAt: true,
        },
      })
    ).filter((j) => (j.rawMarkdown?.length ?? 0) > 0);

    // Group by normalized company. Jobs with no usable company key are left
    // un-deduped (can't block reliably) — a tolerated false-split.
    const byCompany = new Map<string, DedupJob[]>();
    for (const job of candidates) {
      const key = normalizeCompany(job.company);
      if (!key) continue;
      const bucket = byCompany.get(key);
      if (bucket) bucket.push(job);
      else byCompany.set(key, [job]);
    }

    let groupsConsidered = 0;
    let pairsAdjudicated = 0;
    let duplicatesMarked = 0;

    for (const [key, group] of byCompany) {
      if (group.length < 2) continue;
      if (group.length > MAX_GROUP) {
        console.warn(
          `[dedupe] company "${key}" has ${group.length} jobs (> ${MAX_GROUP}) — skipping to bound cost`,
        );
        continue;
      }
      groupsConsidered++;

      // Sort so the best canonical is first: most-advanced status, then oldest
      // (firstSeenAt asc), then id for determinism.
      group.sort((a, b) => {
        const rank = (STATUS_RANK[b.status] ?? 0) - (STATUS_RANK[a.status] ?? 0);
        if (rank !== 0) return rank;
        const t = a.firstSeenAt.getTime() - b.firstSeenAt.getTime();
        if (t !== 0) return t;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });

      // Anchor-based merge: each anchor (canonical) absorbs only jobs adjudicated
      // SAME directly against it. A job marked duplicate is added to `handled`
      // and never re-pointed — so we never take the transitive closure of a
      // non-transitive relation (no chains, no over-merge).
      const handled = new Set<string>();
      for (let i = 0; i < group.length; i++) {
        const anchor = group[i]!;
        if (handled.has(anchor.id)) continue;
        for (let j = i + 1; j < group.length; j++) {
          const other = group[j]!;
          if (handled.has(other.id)) continue;
          pairsAdjudicated++;
          const verdict = await adjudicateSamePair(anchor, other);
          if (!verdict.same) continue;
          try {
            await db.job.update({
              where: { id: other.id },
              data: { status: JobStatus.duplicate, duplicateOfId: anchor.id },
            });
            handled.add(other.id);
            duplicatesMarked++;
            console.log(
              `[dedupe] "${other.title}" (${other.id}) → duplicate of "${anchor.title}" (${anchor.id}) — ${verdict.reason}`,
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : "unknown error";
            console.error(`[dedupe] failed to mark ${other.id} duplicate: ${message}`);
          }
        }
      }
    }

    console.log(
      `[dedupe] groups=${groupsConsidered} pairs=${pairsAdjudicated} duplicatesMarked=${duplicatesMarked}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error(`[dedupe] best-effort node failed, continuing without dedup: ${message}`);
  }

  return {};
}
