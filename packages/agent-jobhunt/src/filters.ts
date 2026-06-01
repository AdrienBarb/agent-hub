import type { ParsedJob } from "./boards/types";

export interface FilterConfig {
  accept_all_switzerland: boolean;
  cities: string[];
  salary_floor_chf: number;
}

export function passesFilters(
  job: ParsedJob,
  cfg: FilterConfig,
): { ok: boolean; reason?: string } {
  if (!cfg.accept_all_switzerland && job.city) {
    const cityOk = cfg.cities.some((c) =>
      job.city!.toLowerCase().includes(c.toLowerCase()),
    );
    if (!cityOk) return { ok: false, reason: `city ${job.city} not in filter` };
  }
  if (job.salaryMax !== null && job.salaryMax < cfg.salary_floor_chf) {
    return {
      ok: false,
      reason: `salary max ${job.salaryMax} < floor ${cfg.salary_floor_chf}`,
    };
  }
  return { ok: true };
}
