"use server";

import { redirect } from "next/navigation";
import {
  createSession,
  destroySession,
  dummyPasswordHash,
  hashPassword,
  hashToken,
  leadExists,
  safeEqual,
  verifyPassword,
} from "@/lib/auth";
import { isUniqueViolation, one, q, tx } from "@/lib/db";
import { cleanEmail, cleanName, isEmail, nameProblem, passwordProblem, type FormState } from "@/lib/forms";

const MAX_FAILS = 8;

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  const email = cleanEmail(form.get("email"));
  const password = String(form.get("password") ?? "");
  const fields = { email };
  if (!email || !password) return { error: "Enter your email and password.", fields };

  const recent = await one<{ n: number }>(
    "select count(*)::int as n from login_attempts where lower(email) = $1 and ok = false and at > now() - interval '15 minutes'",
    [email],
  );
  if ((recent?.n ?? 0) >= MAX_FAILS) {
    return { error: "Too many tries. Wait 15 minutes, then try again.", fields };
  }

  const user = await one<{ id: string; password_hash: string | null; status: string }>(
    "select id, password_hash, status from users where lower(email) = $1",
    [email],
  );
  const hash = user?.password_hash ?? (await dummyPasswordHash());
  const matches = await verifyPassword(password, hash);
  const ok = !!user && user.status === "active" && !!user.password_hash && matches;
  await q("insert into login_attempts (email, ok) values ($1, $2)", [email, ok]);

  if (!ok) {
    if (user && matches && user.status === "disabled") {
      return { error: "Your access has been turned off. Ask your Lead to turn it back on.", fields };
    }
    return { error: "That email and password don't match.", fields };
  }

  await createSession(user!.id);
  redirect("/");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export async function setupLead(_prev: FormState, form: FormData): Promise<FormState> {
  const name = cleanName(form.get("name"));
  const email = cleanEmail(form.get("email"));
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const code = String(form.get("code") ?? "").trim();
  const fields = { name, email };

  const expected = process.env.SETUP_CODE ?? "";
  if (!expected) return { error: "Setup is turned off on this server.", fields };
  if (!code || !safeEqual(code, expected)) return { error: "That setup code isn't right.", fields };
  if (await leadExists()) return { error: "The Lead account already exists. Sign in instead.", fields };

  const problem = nameProblem(name) ?? (isEmail(email) ? null : "Enter a valid email address.") ?? passwordProblem(password, confirm);
  if (problem) return { error: problem, fields };

  let id: string;
  try {
    const row = await one<{ id: string }>(
      `insert into users (email, name, role, status, password_hash, activated_at)
       values ($1, $2, 'lead', 'active', $3, now()) returning id`,
      [email, name, await hashPassword(password)],
    );
    id = row!.id;
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "The Lead account already exists. Sign in instead.", fields };
    throw err;
  }

  await createSession(id);
  redirect("/");
}

export async function acceptInvite(_prev: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  const problem = passwordProblem(password, confirm);
  if (problem) return { error: problem };

  const hash = await hashPassword(password);
  const userId = await tx(async (c) => {
    const res = await c.query<{ user_id: string }>(
      `delete from invites i using users u
        where i.token_hash = $1 and i.user_id = u.id and i.expires_at > now() and u.status = 'invited'
        returning i.user_id`,
      [hashToken(token)],
    );
    const id = res.rows[0]?.user_id;
    if (!id) return null;
    await c.query("update users set password_hash = $1, status = 'active', activated_at = now() where id = $2", [hash, id]);
    return id;
  });

  if (!userId) return { error: "This invite link has expired or was already used. Ask your Lead for a new one." };
  await createSession(userId);
  redirect("/");
}
