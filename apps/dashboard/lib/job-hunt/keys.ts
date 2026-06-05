// TanStack Query key factory for the job-hunt feature. One place to define the
// keys so queries and the mutation invalidations can't drift.
export const jobHuntKeys = {
  all: ["job-hunt"] as const,
  jobs: () => [...jobHuntKeys.all, "jobs"] as const,
  runStatus: () => [...jobHuntKeys.all, "run-status"] as const,
};
