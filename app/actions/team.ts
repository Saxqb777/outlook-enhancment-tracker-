"use server";

import { revalidatePath } from "next/cache";
import { hashToken, newToken, requireLead, siteOrigin } from "@/lib/auth";
import { isUniqueViolation, one, q, tx } from "@/lib/db";
import { cleanEmail, cleanName, isEmail, nameProblem, type InviteState } from "@/lib/forms";

const INVITE_DAYS = 7;

async function freshInvite(userId: string, leadId: string): Promise<string> {
  const token = newToken();
  await tx(async (c) => {
    await c.query("delete from invites where user_id = $1", [userId]);
    await c.query(
      `insert into invites (token_hash, user_id, created_by, expires_at)
       values ($1, $2, $3, now() + make_interval(days => $4))`,
      [hashToken(token), userId, leadId, INVITE_DAYS],
    );
  });
  return `${await siteOrigin()}/invite/${token}`;
}

export async function inviteMember(_prev: InviteState, form: FormData): Promise<InviteState> {
  const lead = await requireLead();
  const name = cleanName(form.get("name"));
  const email = cleanEmail(form.get("email"));
  const fields = { name, email };

  const problem = nameProblem(name) ?? (isEmail(email) ? null : "Enter a valid work email address.");
  if (problem) return { error: problem, fields };

  const existing = await one<{ status: string }>("select status from users where lower(email) = $1", [email]);
  if (existing) {
    const error =
      existing.status === "invited"
        ? "This person is already invited. Use “New link” next to their name below."
        : "Someone on the team already uses this email.";
    return { error, fields };
  }

  let userId: string;
  try {
    const row = await one<{ id: string }>(
      "insert into users (email, name, role, status, created_by) values ($1, $2, 'member', 'invited', $3) returning id",
      [email, name, lead.id],
    );
    userId = row!.id;
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "Someone on the team already uses this email.", fields };
    throw err;
  }

  const link = await freshInvite(userId, lead.id);
  revalidatePath("/team");
  return { link, name, email };
}

export async function newInviteLink(_prev: InviteState, form: FormData): Promise<InviteState> {
  const lead = await requireLead();
  const userId = String(form.get("userId") ?? "");
  const user = await one<{ id: string; name: string; email: string }>(
    "select id, name, email from users where id = $1 and role = 'member' and status = 'invited'",
    [userId],
  );
  if (!user) return { error: "This invite is no longer open." };
  const link = await freshInvite(user.id, lead.id);
  revalidatePath("/team");
  return { link, name: user.name, email: user.email };
}

export async function cancelInvite(form: FormData): Promise<void> {
  await requireLead();
  const userId = String(form.get("userId") ?? "");
  await q("delete from users where id = $1 and role = 'member' and status = 'invited'", [userId]);
  revalidatePath("/team");
}

export async function setMemberAccess(form: FormData): Promise<void> {
  await requireLead();
  const userId = String(form.get("userId") ?? "");
  const turnOn = form.get("access") === "on";
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
