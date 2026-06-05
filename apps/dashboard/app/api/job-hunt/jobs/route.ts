import { type NextRequest, NextResponse } from "next/server";
import { db } from "@hub/core/db";
import { requireHubAuth } from "@/lib/api-auth";
import type { JobsResponse } from "@/lib/job-hunt/types";
import { jobSelect, toJobView } from "./serialize";

// Reads uncached job rows that change as the agent runs and as the user marks
// jobs — never cache this route.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const unauthorized = await requireHubAuth(request);
  if (unauthorized) return unauthorized;

  const [activeRows, oldRows] = await Promise.all([
    db.job.findMany({
      where: { status: "tailored" },
      orderBy: [{ fitScore: "desc" }, { firstSeenAt: "desc" }],
      take: 60,
      select: jobSelect,
    }),
    db.job.findMany({
      where: { status: { in: ["applied", "rejected"] } },
      orderBy: [{ tailoredAt: "desc" }, { firstSeenAt: "desc" }],
      take: 60,
      select: jobSelect,
    }),
  ]);

  const body: JobsResponse = {
    active: activeRows.map(toJobView),
    old: oldRows.map(toJobView),
  };
  return NextResponse.json(body);
}
