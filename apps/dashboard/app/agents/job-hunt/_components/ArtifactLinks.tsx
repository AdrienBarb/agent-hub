"use client";

import { artifactHref, type JobView } from "./types";

// The résumé/cover download pair — the bit most likely to change together
// (new artifact kind, label, icon). Shared by JobCard and OldJobCard so the two
// can't drift.
export function ArtifactLinks({ job }: { job: JobView }) {
  return (
    <>
      {job.resumeKind ? (
        <a
          className="jh-dl"
          href={artifactHref(job.id, job.resumeKind)}
          target="_blank"
          rel="noreferrer"
        >
          ⤓ Résumé
        </a>
      ) : null}
      {job.coverKind ? (
        <a
          className="jh-dl"
          href={artifactHref(job.id, job.coverKind)}
          target="_blank"
          rel="noreferrer"
        >
          ⤓ Cover
        </a>
      ) : null}
    </>
  );
}
