/**
 * Shared parser for jobup.ch and jobs.ch — both run on the JobCloud platform
 * and emit identical card markdown. Ported faithfully from the original
 * /job-hunt skill's scripts/boards/jobcloud.ts (regex tuned over many runs).
 */
import type { BoardAdapter, ParsedJob } from "./types";

const BADGES = new Set([
  "Easy apply",
  "Promoted",
  "PromotedEasy apply",
  "New",
  "Easy applyNew",
  "PromotedEasy applyNew",
]);

function makeJobcloudParser(opts: {
  id: string;
  host: string;
  detailSegment: string;
}) {
  return function parse(md: string): ParsedJob[] {
    const detailPath = opts.detailSegment.replace(/\//g, "\\/");
    const cardRe = new RegExp(
      `\\[([\\s\\S]*?Is this job relevant to you\\?)\\]` +
        `\\((https:\\/\\/${opts.host.replace(/\./g, "\\.")}${detailPath}[0-9a-f-]+\\/?)` +
        `\\s+"([^"]+)"\\)`,
      "g",
    );

    const jobs: ParsedJob[] = [];
    const seen = new Set<string>();

    let m: RegExpExecArray | null;
    while ((m = cardRe.exec(md)) !== null) {
      const block = m[1] ?? "";
      const url = m[2] ?? "";
      const title = (m[3] ?? "").trim();

      const uuidMatch = url.match(/([0-9a-f-]{32,})/);
      if (!uuidMatch) continue;
      const slug = uuidMatch[1] ?? "";
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);

      const lines = block
        .split(/\r?\n/)
        .map((l) => l.replace(/\\+$/, "").trim())
        .filter((l) => l.length > 0);

      const findAfter = (label: string): string => {
        const i = lines.findIndex((l) => l === label);
        return i >= 0 && i + 1 < lines.length ? (lines[i + 1] ?? "") : "";
      };
      const city = findAfter("Place of work:");
      const contract = findAfter("Contract type:");

      let company = "";
      const tailIdx = lines.findIndex((l) =>
        l.startsWith("Is this job relevant"),
      );
      if (tailIdx > 0) {
        for (let i = tailIdx - 1; i >= 0; i--) {
          const l = lines[i] ?? "";
          if (!l) continue;
          if (l.startsWith("![")) continue;
          if (BADGES.has(l)) continue;
          if (/^(Promoted|Easy apply)+(New)?$/.test(l)) continue;
          company = l;
          break;
        }
      }

      if (!company && contract) {
        const ci = lines.indexOf(contract);
        if (ci >= 0) {
          for (let i = ci + 1; i < lines.length; i++) {
            const l = lines[i] ?? "";
            if (!l || l.startsWith("![") || BADGES.has(l)) continue;
            if (/^(Promoted|Easy apply)+(New)?$/.test(l)) continue;
            if (l.startsWith("Is this job relevant")) break;
            company = l;
            break;
          }
        }
      }

      jobs.push({
        slug,
        board: opts.id,
        title,
        company: company || null,
        city: city || null,
        salary: null,
        salaryMin: null,
        salaryMax: null,
        tech: [],
        url,
      });
    }
    return jobs;
  };
}

export const jobup: BoardAdapter = {
  id: "jobup",
  displayName: "jobup.ch",
  parse: makeJobcloudParser({
    id: "jobup",
    host: "www.jobup.ch",
    detailSegment: "/en/jobs/detail/",
  }),
};

export const jobsch: BoardAdapter = {
  id: "jobsch",
  displayName: "jobs.ch",
  parse: makeJobcloudParser({
    id: "jobsch",
    host: "www.jobs.ch",
    detailSegment: "/en/vacancies/detail/",
  }),
};
