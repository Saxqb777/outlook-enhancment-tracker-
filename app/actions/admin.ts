"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin, VIEW_AS_COOKIE } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { one, q } from "@/lib/db";

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

/** Admin only: make a Member a Lead, or a Lead a Member, at any time. */
export async function setRole(form: FormData): Promise<void> {
  await requireAdmin();
  const id = String(form.get("userId") ?? "");
  const role = form.get("role") === "lead" ? "lead" : "member";
  // The team always keeps at least one Lead.
  const lastLead = role === "member" && !(await one("select 1 from users where role = 'lead' and status = 'active' and id <> $1", [/^[0-9a-f-]{36}$/.test(id) ? id : null]));
  if (/^[0-9a-f-]{36}$/.test(id) && !lastLead) {
    await q("update users set role = $2 where id = $1 and role in ('lead', 'member') and role <> $2", [id, role]);
    await q("update invites set role = $2 where user_id = $1", [id, role]);
  }
  revalidatePath("/admin");
  revalidatePath("/team");
}
