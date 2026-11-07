import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { one, q } from "@/lib/db";

export type Role = "lead" | "member" | "admin";
export type User = { id: string; email: string; name: string; role: Role };

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
}

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return one<User>(
    `select u.id, u.email, u.name, u.role
       from sessions s join users u on u.id = s.user_id
      where s.id = $1 and s.expires_at > now() and u.status = 'active'`,
    [hashToken(token)],
  );
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

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

export type Viewer = {
  /** Who the pages are shown for: the signed-in person, or the person the Admin is looking as. */
  me: User;
  /** The signed-in person. */
  real: User;
  /** True for the Admin: nothing can be changed. */
  viewOnly: boolean;
  /** Set when the Admin is looking at someone else's view. */
  viewingAs: User | null;
};

export const getViewer = cache(async (): Promise<Viewer> => {
  const real = await requireUser();
  if (real.role !== "admin") return { me: real, real, viewOnly: false, viewingAs: null };
  const id = (await cookies()).get(VIEW_AS_COOKIE)?.value ?? "";
  const target = /^[0-9a-f-]{36}$/.test(id)
    ? await one<User>("select id, email, name, role from users where id = $1 and status = 'active' and role <> 'admin'", [id])
    : null;
  return { me: target ?? real, real, viewOnly: true, viewingAs: target };
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
