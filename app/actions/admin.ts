"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin, VIEW_AS_COOKIE } from "@/lib/auth";
import { one } from "@/lib/db";

/** Admin only: show the app the way this person sees it (view only). */
export async function viewAs(form: FormData): Promise<void> {
  await requireAdmin();
  const id = String(form.get("userId") ?? "");
  const target = /^[0-9a-f-]{36}$/.test(id)
    ? await one<{ id: string }>("select id from users where id = $1 and status = 'active' and role <> 'admin'", [id])
    : null;
  if (!target) redirect("/admin");
  (await cookies()).set(VIEW_AS_COOKIE, target.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 3600,
  });
  redirect("/");
}

export async function stopViewAs(): Promise<void> {
  await requireAdmin();
  (await cookies()).delete(VIEW_AS_COOKIE);
  redirect("/admin");
}
