import { NextResponse, type NextRequest } from "next/server";

export const config = {
  matcher: ["/agents/:path*"],
};

export function proxy(request: NextRequest) {
  const expected = process.env.HUB_ACCESS_TOKEN;
  const token = request.cookies.get("hub_token")?.value;

  if (!expected || token !== expected) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
