import type { BoardAdapter } from "./types";
import { jobup, jobsch } from "./jobcloud";

export const boardRegistry: Record<string, BoardAdapter> = {
  jobup,
  jobsch,
};

export type { BoardAdapter, ParsedJob } from "./types";
