"use client";

import { useEffect, useRef } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getJobs,
  getRunStatus,
  patchJobStatus,
  triggerRun,
} from "@/lib/job-hunt/api";
import { jobHuntKeys } from "@/lib/job-hunt/keys";
import type {
  JobsResponse,
  JobView,
  MarkableStatus,
} from "@/lib/job-hunt/types";

// How often to re-poll while a run is active. Short enough that freshly-tailored
// jobs stream in, long enough not to hammer the DB.
const POLL_MS = 5000;

// Latest-run status. Polls itself while a run is active so it notices completion
// on its own; once `running` is false it stops until something invalidates it
// (e.g. a fresh "Run now").
export function useRunStatus() {
  return useQuery({
    queryKey: jobHuntKeys.runStatus(),
    queryFn: ({ signal }) => getRunStatus(signal),
    refetchInterval: (query) =>
      query.state.data?.running ? POLL_MS : false,
  });
}

// The board's jobs. Polls only while a run is in progress (driven by the
// caller's run-status), so an idle board makes no background requests.
export function useJobs(pollWhileRunning: boolean) {
  return useQuery({
    queryKey: jobHuntKeys.jobs(),
    queryFn: ({ signal }) => getJobs(signal),
    refetchInterval: pollWhileRunning ? POLL_MS : false,
  });
}

// Force one final jobs refetch on the run's true→false edge. The interval poll
// stops the instant a run ends, but the last batch of tailored jobs is often
// written right at completion — without this they wouldn't appear until the next
// focus/manual refetch.
export function useRefreshJobsOnRunComplete(isRunning: boolean) {
  const queryClient = useQueryClient();
  const wasRunning = useRef(isRunning);
  useEffect(() => {
    if (wasRunning.current && !isRunning) {
      void queryClient.invalidateQueries({ queryKey: jobHuntKeys.jobs() });
    }
    wasRunning.current = isRunning;
  }, [isRunning, queryClient]);
}

// Fire-and-forget run trigger. On success it invalidates run-status so polling
// kicks in immediately rather than waiting for the next focus/interval.
export function useTriggerRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerRun,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: jobHuntKeys.runStatus(),
      });
    },
  });
}

// Apply / Skip / Restore. Optimistically moves the job between the active and
// old lists in the cache, rolls back on error, and reconciles with the server
// on settle. The exit animation is the caller's concern (view-only state); this
// hook owns the data.
export function useMarkJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ job, status }: { job: JobView; status: MarkableStatus }) =>
      patchJobStatus(job.id, status),
    onMutate: async ({ job, status }) => {
      await queryClient.cancelQueries({ queryKey: jobHuntKeys.jobs() });
      const previous = queryClient.getQueryData<JobsResponse>(
        jobHuntKeys.jobs(),
      );
      if (previous) {
        queryClient.setQueryData<JobsResponse>(
          jobHuntKeys.jobs(),
          moveJob(previous, job, status),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(jobHuntKeys.jobs(), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: jobHuntKeys.jobs() });
    },
  });
}

// Pure cache transform: drop the job from both lists, then re-insert it at the
// top of its destination with the new status. The re-inserted row is taken from
// the *current* cache (a background poll may have refreshed its fields since the
// click), falling back to the clicked snapshot if it's no longer cached.
// "tailored" (Restore) sends it to active; "applied"/"rejected" send it to old.
function moveJob(
  data: JobsResponse,
  job: JobView,
  status: MarkableStatus,
): JobsResponse {
  const current =
    data.active.find((j) => j.id === job.id) ??
    data.old.find((j) => j.id === job.id) ??
    job;
  const updated: JobView = { ...current, status };
  const active = data.active.filter((j) => j.id !== job.id);
  const old = data.old.filter((j) => j.id !== job.id);

  if (status === "tailored") {
    return { active: [updated, ...active], old };
  }
  return { active, old: [updated, ...old] };
}
