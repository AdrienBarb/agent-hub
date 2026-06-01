"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@hub/core/env";

export async function signIn(formData: FormData): Promise<void> {
  const submitted = String(formData.get("token") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (submitted !== env.HUB_ACCESS_TOKEN) {
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
