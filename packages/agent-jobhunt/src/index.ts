export { jobHuntFunctions, jobHuntDailyRun } from "./inngest";
export { jobHuntGraph } from "./graph";

export const manifest = {
  slug: "job-hunt",
  name: "Job Hunt",
  cron: "0 6 * * *",
  timezone: "Europe/Zurich",
  dashboardPath: "/agents/job-hunt",
} as const;
