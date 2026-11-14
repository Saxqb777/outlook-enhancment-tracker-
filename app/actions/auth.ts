"use server";

import { redirect } from "next/navigation";
import {
  createSession,
  destroySession,
  dummyPasswordHash,
  hashPassword,
  hashToken,
  leadExists,
  requireUser,
  safeEqual,
  verifyPassword,
} from "@/lib/auth";
import { isUniqueViolation, one, q, tx } from "@/lib/db";
import { createVendorSession, destroyVendorSession } from "@/lib/vendor-auth";
import { cleanEmail, cleanName, isEmail, nameProblem, passwordProblem, type FormState } from "@/lib/forms";

import { clientIp, housekeeping, logActivity } from "@/lib/activity";

const MAX_FAILS = 8;
/**
 * Slows password guessing without letting a stranger lock a real person out:
 * 8 wrong tries per email from one network address, 30 wrong tries from one address across all emails,
 * and 50 wrong tries on one email from anywhere, each within 15 minutes.
 */
async function tooManyTries(email: string, ip: string): Promise<boolean> {
  const r = await one<{ pair: number; addr: number; mail: number }>(
    `select count(*) filter (where lower(email) = $1 and ip = $2)::int as pair,
            count(*) filter (where ip = $2)::int as addr,
            count(*) filter (where lower(email) = $1)::int as mail
       from login_attempts where ok = false and at > now() - interval '15 minutes' and (lower(email) = $1 or ip = $2)`,
    [email, ip],
  );
  return (r?.pair ?? 0) >= MAX_FAILS || (r?.addr ?? 0) >= 30 || (r?.mail ?? 0) >= 50;
}

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  const email = cleanEmail(form.get("email"));
  const password = String(form.get("password") ?? "");
  const fields = { email };
  if (!email || !password) return { error: "Enter your email and password.", fields };

  const ip = await clientIp();
  if (await tooManyTries(email, ip)) return { error: "Too many tries. Wait 15 minutes, then try again.", fields };

  const user = await one<{ id: string; password_hash: string | null; status: string; role: string }>(
    "select id, password_hash, status, role from users where lower(email) = $1",
    [email],
  );
  const hash = user?.password_hash ?? (await dummyPasswordHash());
  const matches = await verifyPassword(password, hash);
  const ok = !!user && user.status === "active" && !!user.password_hash && matches;
  await q("insert into login_attempts (email, ok, ip) values ($1, $2, $3)", [email, ok, ip]);

  // Not a team account: it may be a vendor's. Vendors get their own session and only ever see the vendor portal.
  if (!user) {
    const vu = await one<{ id: string; password_hash: string; status: string; vstatus: string }>(
      "select u.id, u.password_hash, u.status, v.status as vstatus from vendor_users u join vendors v on v.id = u.vendor_id where lower(u.email) = $1",
      [email],
    );
    if (vu && (await verifyPassword(password, vu.password_hash))) {
      if (vu.status !== "active" || vu.vstatus !== "active") return { error: "Your access has been turned off. Ask the person who sends you requests.", fields };
      await q("update login_attempts set ok = true where id = (select max(id) from login_attempts where lower(email) = $1)", [email]);
      await destroySession();
      await createVendorSession(vu.id);
      await housekeeping();
      redirect("/portal");
    }
  }

  if (!ok) {
    if (user && matches && user.status === "disabled") {
      return { error: "Your access has been turned off. Ask your Lead to turn it back on.", fields };
    }
    return { error: "That email and password don't match.", fields };
  }

  await destroyVendorSession();
  await createSession(user!.id);
  await housekeeping();
  redirect(user!.role === "admin" ? "/admin" : "/");
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
  const ip = await clientIp();
  if (await tooManyTries("setup-code", ip)) return { error: "Too many tries. Wait 15 minutes, then try again.", fields };
  if (!code || !safeEqual(code, expected)) {
    await q("insert into login_attempts (email, ok, ip) values ('setup-code', false, $1)", [ip]);
    return { error: "That setup code isn't right.", fields };
  }
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
  const name = cleanName(form.get("name"));
  const email = cleanEmail(form.get("email"));
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const fields = { name, email };

  const problem = nameProblem(name) ?? (isEmail(email) ? null : "Enter a valid work email address.") ?? passwordProblem(password, confirm);
  if (problem) return { error: problem, fields };

  const hash = await hashPassword(password);
  type Outcome = { id: string; role: string } | { error: string };
  let outcome: Outcome;
  try {
    outcome = await tx<Outcome>(async (c) => {
      const inv = (
        await c.query<{ user_id: string | null; created_by: string | null; role: string }>(
          "select user_id, created_by, role from invites where token_hash = $1 and expires_at > now() for update",
          [hashToken(token)],
        )
      ).rows[0];
      if (!inv) return { error: "This invite link has expired or was already used. Ask your Lead for a new one." };
      const taken = await c.query("select 1 from users where lower(email) = $1 and ($2::uuid is null or id <> $2) union all select 1 from vendor_users where lower(email) = $1", [email, inv.user_id]);
      if (taken.rowCount) return { error: "This email already has an account. Sign in instead, or use a different email." };
      let id: string;
      let role = "member";
      if (inv.user_id) {
        const res = await c.query<{ id: string; role: string }>(
          `update users set name = $1, email = $2, password_hash = $3, status = 'active', activated_at = now()
            where id = $4 and status = 'invited' returning id, role`,
          [name, email, hash, inv.user_id],
        );
        if (!res.rows[0]) return { error: "This invite link was already used. Sign in instead." };
        id = res.rows[0].id;
        role = res.rows[0].role;
      } else {
        const res = await c.query<{ id: string }>(
          `insert into users (email, name, role, status, password_hash, created_by, activated_at)
           values ($1, $2, $3, 'active', $4, $5, now()) returning id`,
          [email, name, inv.role === "lead" ? "lead" : "member", hash, inv.created_by],
        );
        id = res.rows[0].id;
        role = inv.role === "lead" ? "lead" : "member";
      }
      await c.query("delete from invites where token_hash = $1", [hashToken(token)]);
      return { id, role };
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "This email already has an account. Sign in instead, or use a different email.", fields };
    throw err;
  }

  if ("error" in outcome) return { error: outcome.error, fields };
  await createSession(outcome.id);
  redirect(outcome.role === "admin" ? "/admin" : "/");
}

export async function resetPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const problem = passwordProblem(password, confirm);
  if (problem) return { error: problem };
  const hash = await hashPassword(password);
  // One link type for both: a team person, or a person at a vendor.
  const who = await tx<{ user: string | null; vendor: string | null } | null>(async (c) => {
    const r = (await c.query<{ user_id: string | null; vendor_user_id: string | null }>("select user_id, vendor_user_id from password_resets where token_hash = $1 and expires_at > now() for update", [hashToken(token)])).rows[0];
    if (!r) return null;
    if (r.vendor_user_id) {
      await c.query("update vendor_users set password_hash = $1 where id = $2 and status = 'active'", [hash, r.vendor_user_id]);
      await c.query("delete from password_resets where vendor_user_id = $1", [r.vendor_user_id]);
      await c.query("delete from vendor_sessions where vendor_user_id = $1", [r.vendor_user_id]);
      await c.query("delete from login_attempts where lower(email) = (select lower(email) from vendor_users where id = $1)", [r.vendor_user_id]);
      return { user: null, vendor: r.vendor_user_id };
    }
    await c.query("update users set password_hash = $1 where id = $2 and status = 'active'", [hash, r.user_id]);
    await c.query("delete from password_resets where user_id = $1", [r.user_id]);
    await c.query("delete from sessions where user_id = $1", [r.user_id]);
    await c.query("delete from login_attempts where lower(email) = (select lower(email) from users where id = $1)", [r.user_id]);
    return { user: r.user_id, vendor: null };
  });
  if (!who) return { error: "This reset link has expired or was already used. Ask for a new one." };
  if (who.vendor) {
    await destroySession();
    await logActivity({ vendorUserId: who.vendor }, "password_reset", "A vendor person set a new password with a reset link");
    await createVendorSession(who.vendor);
    redirect("/portal");
  }
  await logActivity({ userId: who.user }, "password_reset", "Set a new password with a reset link");
  await createSession(who.user!);
  redirect("/");
}

/** The Admin has nobody above them, so a forgotten Admin password is reset with the server's setup code. */
export async function resetAdminPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const code = String(form.get("code") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const expected = process.env.SETUP_CODE ?? "";
  if (!expected) return { error: "This is turned off on this server." };
  const ip = await clientIp();
  if (await tooManyTries("setup-code", ip)) return { error: "Too many tries. Wait 15 minutes, then try again." };
  if (!code || !safeEqual(code, expected)) {
    await q("insert into login_attempts (email, ok, ip) values ('setup-code', false, $1)", [ip]);
    return { error: "That setup code isn't right." };
  }
  const problem = passwordProblem(password, String(form.get("confirm") ?? ""));
  if (problem) return { error: problem };
  const admin = await one<{ id: string }>("select id from users where role = 'admin' and status = 'active' order by created_at limit 1");
  if (!admin) return { error: "There is no Admin account to reset." };
  await tx(async (c) => {
    await c.query("update users set password_hash = $1 where id = $2", [await hashPassword(password), admin.id]);
    await c.query("delete from sessions where user_id = $1", [admin.id]);
  });
  await logActivity({ userId: admin.id }, "password_reset", "Admin password reset with the setup code");
  await createSession(admin.id);
  redirect("/admin");
}

/** Anyone on the team can change their own password. Other devices are signed out. */
export async function changePassword(_prev: FormState, form: FormData): Promise<FormState> {
  const me = await requireUser();
  const current = String(form.get("current") ?? "");
  const password = String(form.get("password") ?? "");
  const problem = passwordProblem(password, String(form.get("confirm") ?? ""));
  const row = await one<{ password_hash: string | null }>("select password_hash from users where id = $1", [me.id]);
  if (!row?.password_hash || !(await verifyPassword(current, row.password_hash))) return { error: "Your current password isn't right." };
  if (problem) return { error: problem };
  if (current === password) return { error: "Choose a password that is different from the current one." };
  await tx(async (c) => {
    await c.query("update users set password_hash = $1 where id = $2", [await hashPassword(password), me.id]);
    await c.query("delete from sessions where user_id = $1", [me.id]);
  });
  await logActivity({ userId: me.id }, "password_changed", "Changed their own password");
  await createSession(me.id);
  return { fields: { done: "1" } };
}
