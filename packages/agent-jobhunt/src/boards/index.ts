import type { BoardAdapter } from "./types";
import { jobup, jobsch } from "./jobcloud";
import { swissdevjobs } from "./swissdevjobs";

export const boardRegistry: Record<string, BoardAdapter> = {
  jobup,
  jobsch,
  swissdevjobs,
};

export type { BoardAdapter, ParsedJob } from "./types";
