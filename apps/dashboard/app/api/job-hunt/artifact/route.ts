import { type NextRequest, NextResponse } from "next/server";
import { db } from "@hub/core/db";
import { supabase } from "@hub/core/supabase";
import { env } from "@hub/core/env";
import { STORAGE_BUCKET } from "@hub/agent-jobhunt";

// Map of allowed artifact kinds → the Job column holding the storage path.
// The client only ever sends a `kind`; the path is resolved server-side so a
// caller can never request an arbitrary storage object.
const KIND_TO_COLUMN = {
  resume: "resumeStoragePath",
  cover: "coverStoragePath",
  summary: "summaryStoragePath",
  diff: "diffStoragePath",
  "resume-pdf": "resumePdfStoragePath",
  "cover-pdf": "coverPdfStoragePath",
} as const;

type Kind = keyof typeof KIND_TO_COLUMN;

const SIGNED_URL_TTL_SECONDS = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  // The proxy matcher only covers /agents/*, NOT /api/*, so this route must
  // check the auth cookie itself.
  const token = request.cookies.get("hub_token")?.value;
  if (token !== env.HUB_ACCESS_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobId = request.nextUrl.searchParams.get("jobId");
  const kind = request.nextUrl.searchParams.get("kind") as Kind | null;
  if (!jobId || !kind || !(kind in KIND_TO_COLUMN)) {
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
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    return NextResponse.json({ error: "Could not sign URL" }, { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl);
}
