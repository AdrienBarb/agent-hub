"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@hub/core/env";
import { safeStrEqual } from "@/lib/safe-equal";

// Accept only a same-origin relative path (single leading "/", no scheme, no
// host). Anything else falls back to "/". Defends the post-login redirect
// against open-redirect phishing pivots (e.g. ?next=https://evil.com). Not
// exported: a "use server" module may only export async server actions.
function sanitizeNext(raw: string): string {
  if (!raw || raw[0] !== "/") return "/";
  // Reject protocol-relative ("//host") and backslash host tricks ("/\\host"),
  // which browsers normalize to an off-site host.
  if (raw[1] === "/" || raw[1] === "\\") return "/";
  if (raw.includes("\\")) return "/";
  // Decode-then-recheck to catch encoded bypasses ("/%2f%2fevil", "/%5cevil").
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded[0] !== "/" || decoded[1] === "/" || decoded[1] === "\\") {
      return "/";
    }
    if (decoded.includes("\\")) return "/";
  } catch {
    return "/";
  }
  // Backstop: resolve against a throwaway origin and require it stay there. This
  // strips any scheme (javascript:, data:, https:) and returns a pure path.
  try {
    const base = "http://internal.invalid";
    const url = new URL(raw, base);
    if (url.origin !== base) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export async function signIn(formData: FormData): Promise<void> {
  const submitted = String(formData.get("token") ?? "");
  const next = sanitizeNext(String(formData.get("next") ?? "/"));

  if (!(await safeStrEqual(submitted, env.HUB_ACCESS_TOKEN))) {
    redirect(`/auth?error=invalid&next=${encodeURIComponent(next)}`);
  }

  const store = await cookies();
  store.set("hub_token", submitted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect(next);
}
