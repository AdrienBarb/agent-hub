import type { BoardAdapter } from "./types";
import { jobup, jobsch } from "./jobcloud";
import { swissdevjobs } from "./swissdevjobs";
import { linkedin } from "./linkedin";

export const boardRegistry: Record<string, BoardAdapter> = {
  jobup,
  jobsch,
  swissdevjobs,
  linkedin,
};

export type { BoardAdapter, ParsedJob } from "./types";
