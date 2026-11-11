import type { User } from "@/lib/auth";
import { one, q } from "@/lib/db";
import type { Priority, Status } from "@/lib/status";

// Members only ever see their own cases; the Lead sees everything.
const scopeOwner = (me: User) => (me.role === "member" ? me.id : null);

export type PointLite = { id: string; status: Status; due: string | null; text: string; assignee_id: string | null };

export type CaseListRow = {
  id: string;
  subject: string;
  company: string;
  from_name: string;
  priority: Priority;
  deadline: string | null;
  owner_id: string;
  owner_name: string;
  owner_lead: boolean;
  created_at: Date;
  points: PointLite[];
  members: { id: string; name: string }[];
  refs: string;
  unread: number;
};

export async function listCases(me: User): Promise<CaseListRow[]> {
  return q<CaseListRow>(
    `select c.id::text as id, c.subject, c.company, c.from_name, c.priority, c.deadline::text as deadline,
            c.owner_id, u.name as owner_name, u.role = 'lead' as owner_lead, c.created_at,
            (select coalesce(string_agg(d->>'value', ' '), '') from jsonb_array_elements(c.details) d) as refs,
            (select count(*)::int from case_messages m where m.case_id = c.id and m.user_id is distinct from $2
               and m.created_at > coalesce((select r.last_read_at from case_reads r where r.case_id = c.id and r.user_id = $2), c.created_at)) as unread,
            coalesce(json_agg(json_build_object('id', p.id::text, 'status', p.status, 'due', p.due::text, 'text', p.text, 'assignee_id', p.assignee_id) order by p.position, p.id)
                     filter (where p.id is not null), '[]') as points,
            (select coalesce(json_agg(json_build_object('id', mu.id, 'name', mu.name) order by lower(mu.name)), '[]')
               from case_members cm join users mu on mu.id = cm.user_id where cm.case_id = c.id) as members
       from cases c join users u on u.id = c.owner_id
       left join points p on p.case_id = c.id
      where ($1::uuid is null or c.owner_id = $1 or exists (select 1 from case_members cm where cm.case_id = c.id and cm.user_id = $1))
      group by c.id, u.name, u.role
      order by c.created_at desc`,
    [scopeOwner(me), me.id],
  );
}

export type FileLite = { id: string; name: string; mime: string; size: number };

export type PointEvent = {
  id: string;
  point_id: string;
  email_id: string | null;
  files: FileLite[];
  kind: "created" | "status" | "update" | "remark" | "due" | "reopen" | "reply";
  text: string | null;
  status: Status | null;
  due: string | null;
  created_at: Date;
  user_name: string | null;
  user_role: "lead" | "member" | null;
};

export type PointFull = {
  id: string;
  email_id: string | null;
  position: number;
  text: string;
  source_quote: string | null;
  status: Status;
  wait_reason: string | null;
  due: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  events: PointEvent[];
};

export type CaseFull = {
  id: string;
  owner_id: string;
  owner_name: string;
  owner_lead: boolean;
  created_by_name: string | null;
  subject: string;
  summary: string;
  from_name: string;
  from_email: string;
  company: string;
  priority: Priority;
  deadline: string | null;
  email_to: string;
  email_sent: string;
  email_body: string;
  source: "paste" | "file";
  file_name: string | null;
  details: { label: string; value: string }[];
  created_at: Date;
  points: PointFull[];
  emails: CaseEmail[];
  members: CaseMember[];
};

export type CaseMember = { id: string; name: string; role: "lead" | "member"; added_by_name: string | null; added_at: Date };

export type CaseEmail = {
  id: string;
  position: number;
  from_name: string;
  from_email: string;
  email_to: string;
  email_sent: string;
  subject: string;
  body: string;
  source: "paste" | "file";
  file_name: string | null;
  change_note: string | null;
  added_by_name: string | null;
  created_at: Date;
  file: { name: string; mime: string; size: number } | null;
};

export async function getCase(me: User, id: string): Promise<CaseFull | null> {
  if (!/^\d{1,12}$/.test(id)) return null;
  const c = await one<Omit<CaseFull, "points" | "emails" | "members">>(
    `select c.id::text as id, c.owner_id, o.name as owner_name, o.role = 'lead' as owner_lead, cb.name as created_by_name, c.subject, c.summary,
            c.from_name, c.from_email, c.company, c.priority, c.deadline::text as deadline, c.email_to, c.email_sent,
            c.email_body, c.source, c.file_name, c.details, c.created_at
       from cases c join users o on o.id = c.owner_id left join users cb on cb.id = c.created_by
      where c.id = $1 and ($2::uuid is null or c.owner_id = $2 or exists (select 1 from case_members cm where cm.case_id = c.id and cm.user_id = $2))`,
    [id, scopeOwner(me)],
  );
  if (!c) return null;
  const emails = await q<CaseEmail>(
    `select e.id::text as id, e.position, e.from_name, e.from_email, e.email_to, e.email_sent, e.subject, e.body, e.source,
            e.file_name, e.change_note, u.name as added_by_name, e.created_at,
            case when f.email_id is null then null else json_build_object('name', f.name, 'mime', f.mime, 'size', f.size) end as file
       from case_emails e left join users u on u.id = e.added_by left join email_files f on f.email_id = e.id
      where e.case_id = $1 order by e.position`,
    [id],
  );
  const points = await q<Omit<PointFull, "events">>(
    `select p.id::text as id, p.email_id::text as email_id, p.position, p.text, p.source_quote, p.status, p.wait_reason, p.due::text as due,
            p.assignee_id, a.name as assignee_name
       from points p left join users a on a.id = p.assignee_id where p.case_id = $1 order by p.position, p.id`,
    [id],
  );
  const events = points.length
    ? await q<Omit<PointEvent, "files">>(
        `select e.id::text as id, e.point_id::text as point_id, e.email_id::text as email_id, e.kind, e.text, e.status, e.due::text as due, e.created_at,
                u.name as user_name, u.role as user_role
           from point_events e left join users u on u.id = e.user_id
          where e.point_id = any($1::bigint[]) order by e.created_at, e.id`,
        [points.map((p) => p.id)],
      )
    : [];
  const files = points.length
    ? await q<FileLite & { event_id: string | null }>(
        "select id::text as id, event_id::text as event_id, name, mime, size from attachments where case_id = $1 order by id",
        [id],
      )
    : [];
  const withFiles = events.map((e) => ({ ...e, files: files.filter((f) => f.event_id === e.id).map(({ event_id: _e, ...f }) => (void _e, f)) }));
  const members = await q<CaseMember>(
    `select u.id, u.name, u.role, ab.name as added_by_name, cm.added_at
       from case_members cm join users u on u.id = cm.user_id left join users ab on ab.id = cm.added_by
      where cm.case_id = $1 order by lower(u.name)`,
    [id],
  );
  return { ...c, emails, members, points: points.map((p) => ({ ...p, events: withFiles.filter((e) => e.point_id === p.id) })) };
}

export type BoardPoint = {
  id: string;
  case_id: string;
  position: number;
  text: string;
  status: Status;
  wait_reason: string | null;
  due: string | null;
  subject: string;
  priority: Priority;
  owner_id: string;
  owner_name: string;
  owner_lead: boolean;
  assignee_id: string | null;
  assignee_name: string | null;
  shared: boolean;
  last_update: string | null;
  last_at: Date | null;
};

export async function listPoints(me: User): Promise<BoardPoint[]> {
  return q<BoardPoint>(
    `select p.id::text as id, p.case_id::text as case_id, p.position, p.text, p.status, p.wait_reason, p.due::text as due,
            c.subject, c.priority, c.owner_id, u.name as owner_name, u.role = 'lead' as owner_lead,
            p.assignee_id, a.name as assignee_name, exists (select 1 from case_members x where x.case_id = c.id) as shared,
            (select e.text from point_events e where e.point_id = p.id and e.kind = 'update' order by e.created_at desc limit 1) as last_update,
            (select max(e.created_at) from point_events e where e.point_id = p.id) as last_at
       from points p join cases c on c.id = p.case_id join users u on u.id = c.owner_id left join users a on a.id = p.assignee_id
      where ($1::uuid is null or c.owner_id = $1 or exists (select 1 from case_members cm where cm.case_id = c.id and cm.user_id = $1))
      order by p.due nulls last, p.id`,
    [scopeOwner(me)],
  );
}

export type RemarkRow = { id: string; text: string; created_at: Date; point_id: string; point_text: string; case_id: string; user_name: string | null };

export async function recentRemarks(me: User, limit = 4): Promise<RemarkRow[]> {
  return q<RemarkRow>(
    `select e.id::text as id, e.text, e.created_at, p.id::text as point_id, p.text as point_text, c.id::text as case_id, u.name as user_name
       from point_events e join points p on p.id = e.point_id join cases c on c.id = p.case_id
       left join users u on u.id = e.user_id
      where e.kind = 'remark' and (c.owner_id = $1 or exists (select 1 from case_members cm where cm.case_id = c.id and cm.user_id = $1))
      order by e.created_at desc limit $2`,
    [me.id, limit],
  );
}

export type ActivityRow = { id: string; kind: PointEvent["kind"]; text: string | null; status: Status | null; due: string | null; created_at: Date; user_name: string | null; point_id: string; point_text: string; case_id: string };

export async function recentActivity(me: User, limit = 6): Promise<ActivityRow[]> {
  return q<ActivityRow>(
    `select e.id::text as id, e.kind, e.text, e.status, e.due::text as due, e.created_at, u.name as user_name,
            p.id::text as point_id, p.text as point_text, c.id::text as case_id
       from point_events e join points p on p.id = e.point_id join cases c on c.id = p.case_id
       left join users u on u.id = e.user_id
      where ($1::uuid is null or c.owner_id = $1 or exists (select 1 from case_members cm where cm.case_id = c.id and cm.user_id = $1)) and e.kind <> 'created'
      order by e.created_at desc limit $2`,
    [scopeOwner(me), limit],
  );
}

export type Assignee = { id: string; name: string; role: "lead" | "member" };

export async function assignees(): Promise<Assignee[]> {
  return q<Assignee>(`select id, name, role from users where status = 'active' and role <> 'admin' order by (role = 'lead') desc, lower(name)`);
}

/** Who approves, for wording like "Irfan approves": the Lead's first name, or "a Lead" when there are several. */
export async function leadName(): Promise<string> {
  const rows = await q<{ name: string }>("select name from users where role = 'lead' and status = 'active' order by created_at");
  if (rows.length === 1) return rows[0].name.trim().split(/\s+/)[0] || "the Lead";
  return rows.length ? "a Lead" : "the Lead";
}
