import { cookies } from "next/headers";
import { getRealUser as getCurrentUser, hashToken, SESSION_COOKIE } from "@/lib/auth";
import { q } from "@/lib/db";
import { pushConfigured, pushTest } from "@/lib/push";
import { getVendorUser, VENDOR_COOKIE } from "@/lib/vendor-auth";

export const dynamic = "force-dynamic";

const okUrl = (u: unknown): u is string => typeof u === "string" && u.length < 1000 && /^https:\/\/[a-z0-9.-]+(:\d{2,5})?\//i.test(u);
const okKey = (k: unknown): k is string => typeof k === "string" && k.length > 10 && k.length < 300 && /^[A-Za-z0-9_\-+/=]+$/.test(k);

/** This browser or phone wants notifications for the person signed in on it. */
export async function POST(req: Request) {
  if (!pushConfigured()) return Response.json({ error: "Notifications aren't set up on this server." }, { status: 501 });
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (!body || !okUrl(body.endpoint) || !okKey(body.keys?.p256dh) || !okKey(body.keys?.auth)) return Response.json({ error: "Bad request." }, { status: 400 });
  const jar = await cookies();
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 200);
  const user = await getCurrentUser();
  if (user) {
    const sid = hashToken(jar.get(SESSION_COOKIE)?.value ?? "");
    await q(
      `insert into push_subs (user_id, session_id, endpoint, p256dh, auth, ua) values ($1, $2, $3, $4, $5, $6)
       on conflict (endpoint) do update set user_id = excluded.user_id, vendor_user_id = null, session_id = excluded.session_id, vendor_session_id = null, p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua, fails = 0`,
      [user.id, sid, body.endpoint, body.keys!.p256dh, body.keys!.auth, ua],
    );
    return Response.json({ ok: true });
  }
  const v = await getVendorUser();
  if (v && !v.admin) {
    const sid = hashToken(jar.get(VENDOR_COOKIE)?.value ?? "");
    await q(
      `insert into push_subs (vendor_user_id, vendor_session_id, endpoint, p256dh, auth, ua) values ($1, $2, $3, $4, $5, $6)
       on conflict (endpoint) do update set vendor_user_id = excluded.vendor_user_id, user_id = null, vendor_session_id = excluded.vendor_session_id, session_id = null, p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua, fails = 0`,
      [v.id, sid, body.endpoint, body.keys!.p256dh, body.keys!.auth, ua],
    );
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Sign in first." }, { status: 401 });
}

/** Turn notifications off for this browser or phone. */
export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (!body || !okUrl(body.endpoint)) return Response.json({ error: "Bad request." }, { status: 400 });
  const user = await getCurrentUser();
  const v = user ? null : await getVendorUser();
  if (!user && !v) return Response.json({ error: "Sign in first." }, { status: 401 });
  await q("delete from push_subs where endpoint = $1 and (user_id = $2 or vendor_user_id = $3)", [body.endpoint, user?.id ?? null, v?.id ?? null]);
  return Response.json({ ok: true });
}

/** Sends a test notification to the devices of the person signed in. */
export async function PUT() {
  if (!pushConfigured()) return Response.json({ error: "Notifications aren't set up on this server." }, { status: 501 });
  const user = await getCurrentUser();
  const v = user ? null : await getVendorUser();
  if (!user && !(v && !v.admin)) return Response.json({ error: "Sign in first." }, { status: 401 });
  const n = await pushTest(user ? { user: user.id } : { vendorUser: v!.id });
  return n ? Response.json({ ok: true, devices: n }) : Response.json({ error: "No device is switched on yet. Press Turn on first." }, { status: 400 });
}
