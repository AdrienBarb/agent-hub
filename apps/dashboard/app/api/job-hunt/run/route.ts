import { type NextRequest, NextResponse } from "next/server";
import { inngest } from "@hub/core/inngest";
import { requireHubAuth } from "@/lib/api-auth";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const unauthorized = await requireHubAuth(request);
  if (unauthorized) return unauthorized;

  try {
    await inngest.send({
      name: "jobhunt/run.requested",
      data: { triggeredAt: new Date().toISOString(), source: "dashboard" },
    });
  } catch (err) {
    console.error("POST /api/job-hunt/run: inngest.send failed", err);
    return NextResponse.json(
      { error: "Failed to enqueue run" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
