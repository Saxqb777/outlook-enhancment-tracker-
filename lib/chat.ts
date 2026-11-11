// The case chat: people's messages, AI answers, and everything that happened on the case, in one feed.
import type { User } from "@/lib/auth";
import type { ChatAction } from "@/lib/extract";
import { one, q } from "@/lib/db";
import { STATUS_LABEL, type Status } from "@/lib/status";

export type FeedItem = {
  key: string;
  kind: "text" | "ai" | "system" | "event";
  id: string | null;
  who: string | null;
  lead: boolean;
  mine: boolean;
  body: string;
  point: number | null;
  actions: ChatAction[] | null;
  at: string;
};

export async function canSeeCase(user: User, caseId: string): Promise<boolean> {
  if (!/^\d{1,12}$/.test(caseId)) return false;
  return !!(await one(
    `select 1 from cases c where c.id = $1 and ($2::uuid is null or c.owner_id = $2 or exists (select 1 from case_members cm where cm.case_id = c.id and cm.user_id = $2))`,
    [caseId, user.role === "member" ? user.id : null],
  ));
}

const day = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]}`;
};

export async function caseFeed(user: User, caseId: string): Promise<FeedItem[]> {
  const [msgs, events] = await Promise.all([
    q<{ id: string; kind: "text" | "ai" | "system"; body: string; actions: ChatAction[] | null; created_at: Date; user_id: string | null; name: string | null; role: string | null; n: number | null }>(
      `select m.id::text as id, m.kind, m.body, m.actions, m.created_at, m.user_id, u.name, u.role,
              (select count(*)::int from points x where x.case_id = m.case_id and (x.position, x.id) <= (p.position, p.id)) as n
         from case_messages m left join users u on u.id = m.user_id left join points p on p.id = m.point_id
        where m.case_id = $1 order by m.id desc limit 300`,
      [caseId],
    ),
    q<{ id: string; kind: string; text: string | null; status: Status | null; due: string | null; created_at: Date; name: string | null; role: string | null; n: number; files: number; reply: number | null }>(
      `select e.id::text as id, e.kind, e.text, e.status, e.due::text as due, e.created_at, u.name, u.role,
              (select count(*)::int from points x where x.case_id = p.case_id and (x.position, x.id) <= (p.position, p.id)) as n,
              (select count(*)::int from attachments a where a.event_id = e.id) as files, ce.position as reply
         from point_events e join points p on p.id = e.point_id left join users u on u.id = e.user_id left join case_emails ce on ce.id = e.email_id
        where p.case_id = $1 and e.kind <> 'created' order by e.id desc limit 300`,
      [caseId],
    ),
  ]);
  const items: FeedItem[] = msgs.map((m) => ({
    key: `m${m.id}`,
    kind: m.kind,
    id: m.id,
    who: m.name,
    lead: m.role === "lead",
    mine: m.user_id === user.id && m.kind === "text",
    body: m.body,
    point: m.kind === "text" && m.n ? m.n : null,
    actions: m.kind === "ai" ? m.actions : null,
    at: new Date(m.created_at).toISOString(),
  }));
  for (const e of events) {
    const files = e.files ? ` (${e.files} file${e.files === 1 ? "" : "s"})` : "";
    const via = e.reply && e.reply > 0 ? `, from Reply ${e.reply}` : "";
    let body = "";
    if (e.kind === "status" && e.status) body = e.status === "approved" ? `approved point ${e.n}` : e.status === "wait" ? `set point ${e.n} to Waiting${e.text ? `: ${e.text}` : ""}` : `moved point ${e.n} to ${STATUS_LABEL[e.status]}`;
    else if (e.kind === "reopen") body = `reopened point ${e.n}`;
    else if (e.kind === "due") body = e.due ? `set point ${e.n} due ${day(e.due)}` : `removed the deadline on point ${e.n}`;
    else if (e.kind === "update") body = `posted an update on point ${e.n}${e.text ? `: ${e.text}` : ""}`;
    else if (e.kind === "remark") body = `added a remark on point ${e.n}${e.text ? `: ${e.text}` : ""}`;
    else if (e.kind === "reply") body = `noted on point ${e.n}: ${e.text ?? ""}`;
    if (!body) continue;
    items.push({ key: `e${e.id}`, kind: "event", id: null, who: e.name, lead: e.role === "lead", mine: false, body: body + files + via, point: e.n, actions: null, at: new Date(e.created_at).toISOString() });
  }
  return items.sort((a, b) => a.at.localeCompare(b.at)).slice(-300);
}

export async function markRead(userId: string, caseId: string) {
  await q(
    `insert into case_reads (case_id, user_id, last_read_at) values ($1, $2, now())
     on conflict (case_id, user_id) do update set last_read_at = now()`,
    [caseId, userId],
  );
}
