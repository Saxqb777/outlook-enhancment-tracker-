import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { one, q } from "@/lib/db";

export type Role = "lead" | "member" | "admin";
export type User = { id: string; email: string; name: string; role: Role; seen_news?: number; can_rates?: boolean; can_docs?: boolean };

export const SESSION_COOKIE = "ae_session";
/** Set only for the Admin: whose view they are looking at. Ignored for everyone else. */
export const VIEW_AS_COOKIE = "ae_view_as";
const SESSION_DAYS = 30;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function scrypt(password: string, salt: Buffer, keylen: number, opts: typeof SCRYPT): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize("NFKC"), salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, N, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await scrypt(password, Buffer.from(salt, "base64"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// Used when an email has no account, so a wrong email takes as long as a wrong password.
let dummyHash: Promise<string> | null = null;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
}

export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

export async function createSession(userId: string): Promise<void> {
  const token = newToken();
  const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await q("insert into sessions (id, user_id, expires_at, user_agent) values ($1, $2, $3, $4)", [
    hashToken(token),
    userId,
    expires,
    userAgent,
  ]);
  await q("update users set last_login_at = now() where id = $1", [userId]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await q("delete from sessions where id = $1", [hashToken(token)]);
  store.delete(SESSION_COOKIE);
  store.delete(VIEW_AS_COOKIE);
  store.delete("ae_view_vendor");
}

/** The person really signed in. The Admin stays the Admin here, also while acting as someone else. */
export const getRealUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return one<User>(
    `select u.id, u.email, u.name, u.role, u.seen_news, u.can_rates, u.can_docs
       from sessions s join users u on u.id = s.user_id
      where s.id = $1 and s.expires_at > now() and u.status = 'active'`,
    [hashToken(token)],
  );
});

/**
 * Who this request acts as. For everyone it is themselves. The Admin can pick a person on the Admin page and
 * then acts as them everywhere: sees what they see and can add, change and remove what they can. Each change
 * made that way is written to the activity list under the Admin's own name.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const real = await getRealUser();
  if (!real || real.role !== "admin") return real;
  const id = (await cookies()).get(VIEW_AS_COOKIE)?.value ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return real;
  const target = await one<User>("select id, email, name, role, seen_news, can_rates, can_docs from users where id = $1 and status = 'active' and role <> 'admin'", [id]);
  if (!target) return real;
  const h = await headers();
  if (h.get("next-action")) {
    let where = "";
    try {
      where = new URL(h.get("referer") ?? "").pathname.slice(0, 80);
    } catch {
      /* no page to name */
    }
    await q("insert into activity_log (user_id, kind, detail) values ($1, 'acted_as', $2)", [real.id, `Admin, acting as ${target.name}, made a change${where ? ` on ${where}` : ""}`]).catch(() => {});
  }
  return target;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireLead(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "lead") redirect("/");
  return user;
}

/** The real person signed in, for things that are personal (password, own devices, the tour). */
export async function requireRealUser(): Promise<User> {
  const user = await getRealUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireRealUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

export type Viewer = {
  /** Who the pages are shown for: the signed-in person, or the person the Admin is acting as. */
  me: User;
  /** The signed-in person. */
  real: User;
  /** True for the Admin on their own view: nothing can be changed. Acting as someone, the Admin can do what they can. */
  viewOnly: boolean;
  /** Set when the Admin is acting as someone else. */
  viewingAs: User | null;
};

export const getViewer = cache(async (): Promise<Viewer> => {
  const real = await requireRealUser();
  const me = (await getCurrentUser()) ?? real;
  const acting = me.id !== real.id;
  return { me, real, viewOnly: real.role === "admin" && !acting, viewingAs: acting ? me : null };
});

/** Lead and Admin see everyone's work; Members see their own. */
export const seesAll = (u: User) => u.role !== "member";

export async function leadExists(): Promise<boolean> {
  return !!(await one("select 1 from users where role = 'lead'"));
}

export async function siteOrigin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
