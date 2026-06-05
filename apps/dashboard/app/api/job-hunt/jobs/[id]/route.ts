import { type NextRequest, NextResponse } from "next/server";
import { db } from "@hub/core/db";
import { Prisma } from "@hub/core/prisma";
import { requireHubAuth } from "@/lib/api-auth";
import { isMarkableStatus } from "@/lib/job-hunt/types";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const unauthorized = await requireHubAuth(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const body: unknown = await request.json().catch(() => null);
  const status = (body as { status?: unknown } | null)?.status;

  // Guard the status against the allow-list so the client can never write an
  // arbitrary JobStatus (e.g. flip a job back to "new" or "duplicate").
  if (!id || !isMarkableStatus(status)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  try {
    await db.job.update({ where: { id }, data: { status } });
  } catch (err) {
    // The job vanished between the client's optimistic move and this write
    // (e.g. a concurrent run re-keyed it). Surface 404 so the client drops it
    // rather than retrying a write that can never succeed.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("PATCH /api/job-hunt/jobs/[id]: update failed", err);
    return NextResponse.json(
      { error: "Failed to update job" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
