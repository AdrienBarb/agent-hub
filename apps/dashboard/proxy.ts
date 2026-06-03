import { NextResponse, type NextRequest } from "next/server";
import { safeStrEqual } from "@/lib/safe-equal";

export const config = {
  matcher: ["/agents/:path*"],
};

export async function proxy(request: NextRequest) {
  // Next 16 runs `proxy` on the Node.js runtime (the edge runtime is not
  // supported for proxy). We read process.env directly and compare in constant
  // time via the runtime-agnostic Web Crypto helper (works on Node and Edge).
  const expected = process.env.HUB_ACCESS_TOKEN;
  const token = request.cookies.get("hub_token")?.value;

  if (!expected || !(await safeStrEqual(token, expected))) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
