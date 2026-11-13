// A simple record of sensitive actions (who did what, when), shown on the Admin page.
import { headers } from "next/headers";
import { q } from "@/lib/db";

/** Never lets a logging problem break the action itself. */
export async function logActivity(who: { userId?: string | null; vendorUserId?: string | null }, kind: string, detail: string): Promise<void> {
  try {
    await q("insert into activity_log (user_id, vendor_user_id, kind, detail) values ($1, $2, $3, $4)", [who.userId ?? null, who.vendorUserId ?? null, kind, detail.slice(0, 500)]);
  } catch (err) {
    console.error("activity log failed", err);
  }
}

/** The caller's network address, as the host reports it. Used only to limit sign-in guessing. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 60) || (h.get("x-real-ip") ?? "").slice(0, 60) || "unknown";
}

/** How many AI calls are allowed: 40 per person per hour, and 400 for the whole team per day. */
export async function aiBlocked(userId: string): Promise<string | null> {
  const r = await q<{ mine: number; team: number }>(
    `select (select count(*)::int from ai_reads where user_id = $1 and created_at > now() - interval '1 hour') as mine,
            (select count(*)::int from ai_reads where created_at > now() - interval '24 hours') as team`,
    [userId],
  );
  if ((r[0]?.mine ?? 0) >= 40) return "That's a lot of AI use in one hour. Wait a little, then try again.";
  if ((r[0]?.team ?? 0) >= 400) return "The team has reached today's AI limit. It opens again tomorrow, or ask the Admin.";
  return null;
}

/**
 * Clears out records nobody needs any more: expired sessions and links, old sign-in tries, and test uploads
 * that were never attached. Runs at most once a day, piggy-backing on a sign-in.
 */
export async function housekeeping(): Promise<void> {
  try {
    const due = await q("update housekeeping set last_run = now() where id = 1 and last_run < now() - interval '1 day' returning id");
    if (!due.length) return;
    await q("delete from sessions where expires_at < now()");
    await q("delete from vendor_sessions where expires_at < now()");
    await q("delete from password_resets where expires_at < now()");
    await q("delete from invites where expires_at < now() - interval '30 days' and user_id is null");
    await q("delete from login_attempts where at < now() - interval '30 days'");
    await q(
      `delete from attachment_local l where l.created_at < now() - interval '1 day'
          and not exists (select 1 from attachments a where a.url = 'local:' || l.key)
          and not exists (select 1 from approval_files a where a.url = 'local:' || l.key)
          and not exists (select 1 from rfq_files a where a.url = 'local:' || l.key)`,
    ).catch(() => {});
  } catch (err) {
    console.error("housekeeping failed", err);
  }
}
