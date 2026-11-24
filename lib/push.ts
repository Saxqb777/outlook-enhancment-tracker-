// Notifications on phones and computers (web push). Nothing here is tied to one page: a "sweep" looks for
// events that happened since the last sweep, works out who each one is for, and sends them.
import { appendFileSync } from "node:fs";
import webpush from "web-push";
import { one, q, tx } from "@/lib/db";

export const pushPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? "";
export const pushConfigured = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

type Note = { user?: string; vendorUser?: string; title: string; body: string; url: string; tag: string };
type State = { case_msg: string; approval_ev: string; rfq_msg: string; point_ev: string; feedback: string; card_alert: string; vendor_join: Date };
const caseRef = (id: string) => `AE-${String(id).padStart(4, "0")}`;
const clip = (s: string | null, n = 140) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const AP_SAY: Record<string, string> = {
  created: "asks you to sign",
  new_version: "sent a corrected version to sign",
  signed: "signed your request",
  sent_back: "sent it back",
  rejected: "rejected it",
  reply: "replied",
  cancelled: "cancelled the request",
  reminded: "is waiting for your signature",
};
const ST_SAY: Record<string, string> = { todo: "To do", progress: "In progress", wait: "Waiting", done: "Done, waiting for the Lead to review", approved: "Approved" };

/** Everything new since `s`, already split per person. Only things that are that person's own business. */
async function collect(s: State): Promise<{ notes: Note[]; next: Partial<Record<keyof State, string | Date>> }> {
  const notes: Note[] = [];
  const next: Partial<Record<keyof State, string | Date>> = {};
  const top = (rows: { id: string }[], key: keyof State) => {
    if (rows.length) next[key] = rows.reduce((m, r) => (BigInt(r.id) > BigInt(m) ? r.id : m), String(s[key]));
  };

  // Chat and case news (assigned, shared): to the owner and the people the case is shared with, never the writer.
  const chat = await q<{ id: string; case_id: string; subject: string; who: string | null; kind: string; body: string; to: string }>(
    `select m.id::text as id, c.id::text as case_id, c.subject, u.name as who, m.kind, m.body, p.uid::text as to
       from case_messages m join cases c on c.id = m.case_id left join users u on u.id = m.user_id
       join lateral (select c.owner_id as uid union select cm.user_id from case_members cm where cm.case_id = c.id) p on p.uid is not null
      where m.id > $1 and m.kind in ('text', 'system') and m.user_id is not null and p.uid <> m.user_id and c.archived_at is null
      order by m.id limit 400`,
    [s.case_msg],
  );
  const chatAll = await q<{ id: string }>("select coalesce(max(id), 0)::text as id from case_messages where id > $1", [s.case_msg]);
  top(chatAll, "case_msg");
  for (const m of chat)
    notes.push({ user: m.to, title: m.kind === "system" ? `${caseRef(m.case_id)} · ${clip(m.subject, 60)}` : `${m.who ?? "Someone"} · ${caseRef(m.case_id)}`, body: clip(m.body || "Sent a file"), url: `/cases/${m.case_id}?tab=chat`, tag: `case-${m.case_id}` });

  // Work on a case's points by someone else: status changes, remarks, new points, new due dates.
  const pts = await q<{ id: string; case_id: string; subject: string; who: string | null; kind: string; text: string | null; status: string | null; due: string | null; title: string; to: string; lead: boolean }>(
    `select e.id::text as id, c.id::text as case_id, c.subject, u.name as who, e.kind, e.text, e.status, e.due::text as due, p.text as title, r.uid::text as to, r.lead
       from point_events e join points p on p.id = e.point_id join cases c on c.id = p.case_id left join users u on u.id = e.user_id
       join lateral (
         select c.owner_id as uid, false as lead union select p.assignee_id, false union select cm.user_id, false from case_members cm where cm.case_id = c.id
         union select l.id, true from users l where l.role = 'lead' and l.status = 'active' and e.kind = 'status' and e.status = 'done'
       ) r on r.uid is not null
      where e.id > $1 and e.user_id is not null and r.uid <> e.user_id and c.archived_at is null and e.kind in ('status', 'remark', 'created', 'due', 'update')
      order by e.id limit 400`,
    [s.point_ev],
  ).catch(() => []);
  top(await q<{ id: string }>("select coalesce(max(id), 0)::text as id from point_events where id > $1", [s.point_ev]), "point_ev");
  const seenPt = new Set<string>();
  for (const e of [...pts].reverse()) {
    // One alert per person per case in a sweep: the newest.
    const k = `${e.to}|${e.case_id}`;
    if (seenPt.has(k)) continue;
    seenPt.add(k);
    const what = e.kind === "status" ? `${clip(e.title, 60)}: ${ST_SAY[e.status ?? ""] ?? e.status ?? "updated"}` : e.kind === "created" ? `New point: ${clip(e.title, 80)}` : e.kind === "due" ? `${clip(e.title, 60)}: due ${e.due ?? "date changed"}` : `${clip(e.title, 50)}: ${clip(e.text, 80) || "updated"}`;
    notes.push({ user: e.to, title: `${e.who ?? "Someone"} · ${caseRef(e.case_id)}`, body: what, url: `/cases/${e.case_id}`, tag: `case-${e.case_id}` });
  }

  // Approvals: the requester hears what the signers did; the signers hear what they need to look at.
  const aps = await q<{ id: string; approval_id: string; title: string; who: string | null; kind: string; text: string | null; to: string }>(
    `select e.id::text as id, a.id::text as approval_id, a.title, u.name as who, e.kind, e.text, r.uid::text as to
       from approval_events e join approvals a on a.id = e.approval_id left join users u on u.id = e.user_id
       join lateral (
         select a.requester_id as uid where e.kind in ('signed', 'sent_back', 'rejected', 'reply')
         union select s.user_id from approval_signers s where s.approval_id = a.id and e.kind in ('created', 'new_version', 'cancelled', 'reply', 'sent_back', 'rejected')
         union select s.user_id from approval_signers s where s.approval_id = a.id and s.state = 'pending' and e.kind = 'reminded'
       ) r on r.uid is not null
      where e.id > $1 and r.uid is distinct from e.user_id order by e.id limit 400`,
    [s.approval_ev],
  );
  top(await q<{ id: string }>("select coalesce(max(id), 0)::text as id from approval_events where id > $1", [s.approval_ev]), "approval_ev");
  for (const e of aps) notes.push({ user: e.to, title: `${e.who ?? "Someone"} ${AP_SAY[e.kind] ?? "updated an approval"}`, body: clip(`AP-${e.approval_id.padStart(4, "0")} · ${e.title}${e.text ? ` · ${e.text}` : ""}`), url: `/approvals/${e.approval_id}`, tag: `ap-${e.approval_id}` });

  // Vendor requests. A vendor wrote or quoted: the person who made the request. An award needs approval: the Leads.
  // The team wrote, or awarded: every login of that vendor.
  const rq = await q<{ id: string; rfq_id: string; title: string; vendor_id: string; vendor: string; who: string | null; kind: string; body: string; from_vendor: boolean; user_id: string | null; created_by: string | null }>(
    `select m.id::text as id, r.id::text as rfq_id, r.title, v.id::text as vendor_id, v.name as vendor, coalesce(vu.name, u.name) as who, m.kind, m.body,
            m.vendor_user_id is not null as from_vendor, m.user_id::text as user_id, r.created_by::text as created_by
       from rfq_messages m join rfqs r on r.id = m.rfq_id join vendors v on v.id = m.vendor_id left join users u on u.id = m.user_id left join vendor_users vu on vu.id = m.vendor_user_id
      where m.id > $1 and not r.test order by m.id limit 400`,
    [s.rfq_msg],
  );
  top(await q<{ id: string }>("select coalesce(max(id), 0)::text as id from rfq_messages where id > $1", [s.rfq_msg]), "rfq_msg");
  if (rq.length) {
    const leads = (await q<{ id: string }>("select id::text as id from users where role = 'lead' and status = 'active'")).map((x) => x.id);
    const vus = await q<{ id: string; vendor_id: string }>("select id::text as id, vendor_id::text as vendor_id from vendor_users where vendor_id = any($1::bigint[])", [[...new Set(rq.map((m) => m.vendor_id))]]);
    for (const m of rq) {
      const ref = `RQ-${m.rfq_id.padStart(4, "0")}`;
      const body = clip(`${ref} · ${m.title}${m.body ? ` · ${m.body}` : ""}`);
      if (m.from_vendor || m.kind === "internal") {
        const to = new Set<string>([...(m.created_by ? [m.created_by] : []), ...(m.kind === "internal" ? leads : [])]);
        if (m.user_id) to.delete(m.user_id);
        for (const uid of to) notes.push({ user: uid, title: m.kind === "internal" ? "Vendor award" : `${m.who ?? "Vendor"} · ${m.vendor}`, body, url: `/vendors/rfq/${m.rfq_id}?v=${m.vendor_id}`, tag: `rq-${m.rfq_id}` });
      } else {
        for (const vu of vus.filter((x) => x.vendor_id === m.vendor_id)) notes.push({ vendorUser: vu.id, title: m.kind === "system" ? "Shipping Tickets" : `${m.who ?? "The team"} wrote`, body, url: `/portal/r/${m.rfq_id}`, tag: `rq-${m.rfq_id}` });
      }
    }
  }

  // A vendor's new login: the person who added that vendor.
  const joins = await q<{ at: Date; vendor_id: string; vendor: string; who: string; to: string | null }>(
    `select vu.created_at as at, v.id::text as vendor_id, v.name as vendor, vu.name as who, v.created_by::text as to
       from vendor_users vu join vendors v on v.id = vu.vendor_id where vu.created_at > $1 and not v.test order by vu.created_at limit 50`,
    [s.vendor_join],
  );
  if (joins.length) next.vendor_join = joins[joins.length - 1].at;
  for (const j of joins) if (j.to) notes.push({ user: j.to, title: `${j.who} joined the vendor portal`, body: `${j.vendor} · new login`, url: `/vendors/v/${j.vendor_id}`, tag: `vn-${j.vendor_id}` });

  // Feedback written in Rates: the Admin.
  const fb = await q<{ id: string; who: string | null; body: string }>("select f.id::text as id, u.name as who, f.body from rate_feedback f left join users u on u.id = f.user_id where f.id > $1 order by f.id limit 50", [s.feedback]);
  top(fb, "feedback");
  if (fb.length) {
    const admins = await q<{ id: string }>("select id::text as id from users where role = 'admin' and status = 'active'");
    for (const f of fb) for (const a of admins) notes.push({ user: a.id, title: `${f.who ?? "Someone"} left feedback on Rates`, body: clip(f.body), url: "/admin#feedback", tag: `fb-${f.id}` });
  }

  // A card crossed its warning level: the Leads and whoever keeps the export documents, so Finance can be asked for a top-up.
  const ca = await q<{ id: string; used: number; credit_limit: number }>("select a.id::text as id, a.used::float as used, a.credit_limit::float as credit_limit from xd_alerts a where a.id > $1 order by a.id limit 20", [s.card_alert]);
  top(ca, "card_alert");
  if (ca.length) {
    const who = await q<{ id: string }>("select id::text as id from users where status = 'active' and (role = 'lead' or (can_docs and role <> 'admin'))");
    const n = (v: number) => Math.round(v).toLocaleString("en-US");
    for (const a of ca) for (const u of who) notes.push({ user: u.id, title: "The card limit is running low", body: `Used AED ${n(a.used)} of ${n(a.credit_limit)}. AED ${n(a.credit_limit - a.used)} left. Ask Finance for a top-up.`, url: "/docs/cards", tag: `card-${a.id}` });
  }
  return { notes, next };
}

type Sub = { id: string; user_id: string | null; vendor_user_id: string | null; endpoint: string; p256dh: string; auth: string };

async function deliver(notes: Note[]): Promise<void> {
  if (!notes.length) return;
  // Local testing: write what would be sent to a file instead of sending it.
  if (process.env.PUSH_DRY_FILE) {
    for (const n of notes) appendFileSync(process.env.PUSH_DRY_FILE, `${JSON.stringify(n)}\n`);
    if (!pushConfigured()) return;
  }
  if (!pushConfigured()) return;
  const users = [...new Set(notes.map((n) => n.user).filter(Boolean))] as string[];
  const vendors = [...new Set(notes.map((n) => n.vendorUser).filter(Boolean))] as string[];
  const subs = await q<Sub>(
    "select id::text as id, user_id::text as user_id, vendor_user_id::text as vendor_user_id, endpoint, p256dh, auth from push_subs where user_id = any($1::uuid[]) or vendor_user_id = any($2::uuid[])",
    [users, vendors],
  );
  if (!subs.length) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@shipping-tickets.app", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const jobs: Promise<void>[] = [];
  for (const n of notes.slice(0, 500))
    for (const s of subs.filter((x) => (n.user ? x.user_id === n.user : x.vendor_user_id === n.vendorUser)))
      jobs.push(
        webpush
          .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.tag }), { TTL: 60 * 60 * 24, urgency: "high", timeout: 8000 })
          .then(async () => {
            await q("update push_subs set last_ok_at = now(), fails = 0 where id = $1", [s.id]);
          })
          .catch(async (err: { statusCode?: number }) => {
            // 404/410: the browser dropped this subscription. Anything else: count it and give up after a while.
            if (err?.statusCode === 404 || err?.statusCode === 410) await q("delete from push_subs where id = $1", [s.id]);
            else await q("delete from push_subs where id = $1 and fails >= 20", [s.id]).then(() => q("update push_subs set fails = fails + 1 where id = $1", [s.id]));
          })
          .catch(() => {}),
      );
  await Promise.allSettled(jobs);
}

let lastSweep = 0;
/**
 * Sends whatever is new. Safe to call often and from anywhere: it checks cheaply first, only one sweep
 * runs at a time across the whole site, and it never throws.
 */
export async function pushSweep(force = false): Promise<void> {
  try {
    if (!force && Date.now() - lastSweep < 3000) return;
    lastSweep = Date.now();
    const due = await one<{ due: boolean }>(
      `select (coalesce((select max(id) from case_messages), 0) > s.case_msg or coalesce((select max(id) from approval_events), 0) > s.approval_ev
            or coalesce((select max(id) from rfq_messages), 0) > s.rfq_msg or coalesce((select max(id) from point_events), 0) > s.point_ev
            or coalesce((select max(id) from rate_feedback), 0) > s.feedback or coalesce((select max(id) from xd_alerts), 0) > s.card_alert or exists (select 1 from vendor_users vu where vu.created_at > s.vendor_join)) as due
         from push_state s where s.id = 1`,
    );
    if (!due?.due) return;
    const notes = await tx(async (c) => {
      const s = (await c.query<State>("select case_msg::text as case_msg, approval_ev::text as approval_ev, rfq_msg::text as rfq_msg, point_ev::text as point_ev, feedback::text as feedback, card_alert::text as card_alert, vendor_join from push_state where id = 1 for update")).rows[0];
      if (!s) return [];
      const r = await collect(s);
      const sets = Object.keys(r.next);
      if (sets.length) await c.query(`update push_state set ${sets.map((k, i) => `${k} = $${i + 1}`).join(", ")} where id = 1`, sets.map((k) => r.next[k as keyof State]));
      return r.notes;
    });
    await deliver(notes);
  } catch (err) {
    console.error("push sweep failed", err);
  }
}

/** A test notification to every device of one person. Returns how many devices it was sent to. */
export async function pushTest(who: { user?: string; vendorUser?: string }): Promise<number> {
  const n = await one<{ n: number }>("select count(*)::int as n from push_subs where user_id = $1 or vendor_user_id = $2", [who.user ?? null, who.vendorUser ?? null]);
  await deliver([{ ...who, title: "Shipping Tickets", body: "Notifications are working on this device.", url: who.vendorUser ? "/portal" : "/", tag: "test" }]);
  return n?.n ?? 0;
}
