/**
 * Output of a board parser: one parsed JD card. Field names match the Prisma
 * Job model so persist can spread without remapping.
 */
export interface ParsedJob {
  slug: string;
  board: string;
  title: string;
  company: string | null;
  city: string | null;
  salary: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  tech: string[];
  url: string;
}

export interface BoardAdapter {
  id: string;
  displayName: string;
  defaults: { waitFor: number; onlyMainContent: boolean };
  parse(md: string): ParsedJob[];
}
