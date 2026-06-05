import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { env } from "@hub/core/env";
import { safeStrEqual } from "@/lib/safe-equal";

// proxy.ts only gates `/agents/*`, so every `/api/*` route must re-check the
// hub_token cookie itself. This is the single place that check lives — each
// handler calls it first and returns the 401 if it's non-null.
export async function requireHubAuth(
  request: NextRequest,
): Promise<NextResponse | null> {
  const token = request.cookies.get("hub_token")?.value;
  if (await safeStrEqual(token, env.HUB_ACCESS_TOKEN)) {
    return null;
  }
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
