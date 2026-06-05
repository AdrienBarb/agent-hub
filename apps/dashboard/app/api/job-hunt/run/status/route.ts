import { type NextRequest, NextResponse } from "next/server";
import { db } from "@hub/core/db";
import { manifest } from "@hub/agent-jobhunt/manifest";
import { requireHubAuth } from "@/lib/api-auth";
import type { RunStatusResponse } from "@/lib/job-hunt/types";

// Latest-run status, polled by the client to decide whether to keep refetching
// the jobs list. Never cache it.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const unauthorized = await requireHubAuth(request);
  if (unauthorized) return unauthorized;

  const run = await db.agentRun.findFirst({
    where: { agentSlug: manifest.slug },
    orderBy: { startedAt: "desc" },
    select: { status: true, startedAt: true, finishedAt: true },
  });

  const body: RunStatusResponse = {
    running: run?.status === "running" || run?.status === "pending",
    status: run?.status ?? null,
    startedAt: run?.startedAt?.toISOString() ?? null,
    finishedAt: run?.finishedAt?.toISOString() ?? null,
  };
  return NextResponse.json(body);
}
