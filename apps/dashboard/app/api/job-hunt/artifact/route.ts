import { type NextRequest, NextResponse } from "next/server";
import { db } from "@hub/core/db";
import { supabase } from "@hub/core/supabase";
import { STORAGE_BUCKET } from "@hub/agent-jobhunt";
import { requireHubAuth } from "@/lib/api-auth";
import { KIND_TO_COLUMN, KIND_TO_FILENAME, type Kind } from "./kinds";

const SIGNED_URL_TTL_SECONDS = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const unauthorized = await requireHubAuth(request);
  if (unauthorized) return unauthorized;

  const jobId = request.nextUrl.searchParams.get("jobId");
  const kind = request.nextUrl.searchParams.get("kind") as Kind | null;
  // hasOwnProperty, not `in` — `in` is true for inherited keys (toString, …),
  // which would slip a non-kind past this allow-list guard.
  if (!jobId || !kind || !Object.prototype.hasOwnProperty.call(KIND_TO_COLUMN, kind)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const column = KIND_TO_COLUMN[kind];
  const job = await db.job.findUnique({
    where: { id: jobId },
    select: {
      resumeStoragePath: true,
      coverStoragePath: true,
      summaryStoragePath: true,
      diffStoragePath: true,
      resumePdfStoragePath: true,
      coverPdfStoragePath: true,
    },
  });
  const path = job?.[column];
  if (!path) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, {
      download: KIND_TO_FILENAME[kind],
    });
  if (error || !data) {
    return NextResponse.json({ error: "Could not sign URL" }, { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl);
}
