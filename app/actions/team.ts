"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hashToken, newToken, requireLead, requireUser, siteOrigin, type User } from "@/lib/auth";
import { one, q, tx } from "@/lib/db";
import type { InviteState } from "@/lib/forms";
import { logActivity } from "@/lib/activity";

const INVITE_DAYS = 7;
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** The Lead, or the Admin (who may make invite links even though everything else is view only). */
async function requireInviter(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "lead" && user.role !== "admin") redirect("/");
  return user;
}

/** A fresh single-use link. With userId it belongs to that pre-named person; without, anyone who opens it joins with `role`. */
async function freshInvite(leadId: string, opts: { userId?: string; label?: string | null; role?: "lead" | "member" }): Promise<string> {
  const token = newToken();
  await tx(async (c) => {
    if (opts.userId) await c.query("delete from invites where user_id = $1", [opts.userId]);
    await c.query(
      `insert into invites (token_hash, user_id, created_by, expires_at, role, label)
       values ($1, $2, $3, now() + make_interval(days => $4), $5, $6)`,
      [hashToken(token), opts.userId ?? null, leadId, INVITE_DAYS, opts.role ?? "member", opts.label ?? null],
    );
  });
  return `${await siteOrigin()}/invite/${token}`;
}

export async function createInviteLink(_prev: InviteState, form: FormData): Promise<InviteState> {
  const inviter = await requireInviter();
  const label = String(form.get("label") ?? "").trim().replace(/\s+/g, " ").slice(0, 80) || null;
  // Only the Admin can invite a Lead.
  const role = inviter.role === "admin" && form.get("role") === "lead" ? "lead" : "member";
  const link = await freshInvite(inviter.id, { label, role });
  await logActivity({ userId: inviter.id }, "invite_link", `Made a ${role === "lead" ? "Lead" : "Member"} invite link${label ? ` (${label})` : ""}`);
  revalidatePath("/team");
  revalidatePath("/admin");
  return { link, name: label ?? undefined, role };
}

export async function newInviteLink(_prev: InviteState, form: FormData): Promise<InviteState> {
  const lead = await requireLead();
  const userId = String(form.get("userId") ?? "");
  if (!isUuid(userId)) return { error: "This invite is no longer open." };
  const user = await one<{ id: string; name: string; email: string | null; role: string }>(
    "select id, name, email, role from users where id = $1 and status = 'invited'",
    [userId],
  );
  if (!user) return { error: "This invite is no longer open." };
  const token = newToken();
  await tx(async (c) => {
    await c.query("delete from invites where user_id = $1", [user.id]);
    await c.query(
      `insert into invites (token_hash, user_id, created_by, expires_at, role)
       values ($1, $2, $3, now() + make_interval(days => $4), $5)`,
      [hashToken(token), user.id, lead.id, INVITE_DAYS, user.role],
    );
  });
  revalidatePath("/team");
  return { link: `${await siteOrigin()}/invite/${token}`, name: user.name, email: user.email ?? undefined };
}

export async function cancelInvite(form: FormData): Promise<void> {
  await requireLead();
  const userId = String(form.get("userId") ?? "");
  if (isUuid(userId)) await q("delete from users where id = $1 and role = 'member' and status = 'invited'", [userId]);
  revalidatePath("/team");
}

export async function cancelOpenInvite(form: FormData): Promise<void> {
  await requireInviter();
  const key = String(form.get("key") ?? "");
  if (/^[0-9a-f]{64}$/.test(key)) await q("delete from invites where token_hash = $1 and user_id is null", [key]);
  revalidatePath("/team");
}

export async function setMemberAccess(form: FormData): Promise<void> {
  const lead = await requireLead();
  const userId = String(form.get("userId") ?? "");
  const turnOn = form.get("access") === "on";
  if (!isUuid(userId)) return;
  await logActivity({ userId: lead.id }, turnOn ? "access_on" : "access_off", `Turned access ${turnOn ? "on" : "off"} for ${(await one<{ name: string }>("select name from users where id = $1", [userId]))?.name ?? "a member"}`);
  if (turnOn) {
    await q("update users set status = 'active' where id = $1 and role = 'member' and status = 'disabled'", [userId]);
  } else {
    await tx(async (c) => {
      await c.query("update users set status = 'disabled' where id = $1 and role = 'member' and status = 'active'", [userId]);
      await c.query("delete from sessions where user_id = $1", [userId]);
    });
  }
  revalidatePath("/team");
}

/** A one-time link for someone who forgot their password. A Lead can make one for Members; the Admin for anyone. Works for 24 hours. */
export async function makeResetLink(_prev: InviteState, form: FormData): Promise<InviteState> {
  const by = await requireInviter();
  const userId = String(form.get("userId") ?? "");
  if (!isUuid(userId)) return { error: "You can't reset this person's password." };
  const user = await one<{ id: string; name: string; role: string }>("select id, name, role from users where id = $1 and status = 'active'", [userId]);
  if (!user || user.role === "admin" || (by.role === "lead" && user.role !== "member")) return { error: "You can't reset this person's password." };
  const token = newToken();
  await tx(async (c) => {
    await c.query("delete from password_resets where user_id = $1", [user.id]);
    await c.query("insert into password_resets (token_hash, user_id, created_by, expires_at) values ($1, $2, $3, now() + interval '24 hours')", [hashToken(token), user.id, by.id]);
  });
  await logActivity({ userId: by.id }, "reset_link", `Made a password reset link for ${user.name}`);
  return { link: `${await siteOrigin()}/reset/${token}`, name: user.name };
}
