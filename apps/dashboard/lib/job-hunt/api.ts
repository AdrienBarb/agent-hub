import { http } from "@/lib/http";
import type {
  JobsResponse,
  MarkableStatus,
  RunStatusResponse,
} from "./types";

// Typed thin wrappers over the job-hunt REST routes. These are the only place
// that knows the URLs and request/response shapes; the query hooks consume them.
// Each read takes the query's AbortSignal so an unmounted/refetched query
// cancels its in-flight request.

export async function getJobs(signal?: AbortSignal): Promise<JobsResponse> {
  const { data } = await http.get<JobsResponse>("/job-hunt/jobs", { signal });
  return data;
}

export async function getRunStatus(
  signal?: AbortSignal,
): Promise<RunStatusResponse> {
  const { data } = await http.get<RunStatusResponse>("/job-hunt/run/status", {
    signal,
  });
  return data;
}

export async function patchJobStatus(
  id: string,
  status: MarkableStatus,
): Promise<void> {
  await http.patch(`/job-hunt/jobs/${encodeURIComponent(id)}`, { status });
}

export async function triggerRun(): Promise<void> {
  await http.post("/job-hunt/run");
}
