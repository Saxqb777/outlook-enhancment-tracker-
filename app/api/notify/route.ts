import { getCurrentUser } from "@/lib/auth";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

/** New chat messages for this person since `after`: on cases they own or share (Leads: every case). */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (user.role === "admin") return Response.json({ now: new Date().toISOString(), items: [], unread: 0 });
  const raw = new URL(req.url).searchParams.get("after") ?? "";
  const after = /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(raw) ? raw : null;
  const scope = user.role === "member" ? user.id : null;
  const mine = `($1::uuid is null or c.owner_id = $1 or exists (select 1 from case_members cm where cm.case_id = c.id and cm.user_id = $1))`;
  // Approvals: tell the requester what the signers did, and the signers what they need to look at.
  const approvals = after
    ? await q<{ id: string; case_id: string; subject: string; who: string | null; kind: string; body: string }>(
        `select 'a' || e.id::text as id, a.id::text as case_id, a.title as subject, u.name as who, 'ap_' || e.kind as kind, left(coalesce(e.text, ''), 160) as body
           from approval_events e join approvals a on a.id = e.approval_id left join users u on u.id = e.user_id
           left join approval_signers s on s.approval_id = a.id and s.user_id = $1
          where e.created_at > $2::timestamptz and e.user_id is distinct from $1
            and ((a.requester_id = $1 and e.kind in ('signed', 'sent_back', 'rejected', 'reply'))
              or (s.user_id is not null and e.kind in ('created', 'new_version', 'cancelled', 'reply', 'sent_back', 'rejected'))
              or (s.state = 'pending' and e.kind = 'reminded'))
          order by e.id desc limit 5`,
        [user.id, after],
      )
    : [];
  const [items, count, now] = await Promise.all([
    after
      ? q<{ id: string; case_id: string; subject: string; who: string | null; kind: string; body: string; at: Date }>(
          `select m.id::text as id, c.id::text as case_id, c.subject, u.name as who, m.kind, left(m.body, 160) as body, m.created_at as at
             from case_messages m join cases c on c.id = m.case_id left join users u on u.id = m.user_id
            where m.created_at > $3::timestamptz and m.kind in ('text', 'ai') and m.user_id is distinct from $2 and ${mine}
            order by m.id desc limit 5`,
          [scope, user.id, after],
        )
      : Promise.resolve([]),
    q<{ n: number }>(
      `select count(*)::int as n from case_messages m join cases c on c.id = m.case_id
        where m.user_id is distinct from $2 and ${mine}
          and m.created_at > coalesce((select r.last_read_at from case_reads r where r.case_id = c.id and r.user_id = $2), c.created_at)`,
      [scope, user.id],
    ),
    q<{ now: Date }>("select now() as now"),
  ]);
  return Response.json({ now: new Date(now[0].now).toISOString(), items: [...items.reverse(), ...approvals.reverse()], unread: count[0]?.n ?? 0 }, { headers: { "Cache-Control": "private, no-store" } });
}
