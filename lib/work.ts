import type { User } from "@/lib/auth";
import { one, q } from "@/lib/db";
import type { Priority, Status } from "@/lib/status";

// Members only ever see their own cases; the Lead sees everything.
const scopeOwner = (me: User) => (me.role === "lead" ? null : me.id);

export type PointLite = { id: string; status: Status; due: string | null; text: string };

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
};

export async function listCases(me: User): Promise<CaseListRow[]> {
  return q<CaseListRow>(
    `select c.id::text as id, c.subject, c.company, c.from_name, c.priority, c.deadline::text as deadline,
            c.owner_id, u.name as owner_name, u.role = 'lead' as owner_lead, c.created_at,
            coalesce(json_agg(json_build_object('id', p.id::text, 'status', p.status, 'due', p.due::text, 'text', p.text) order by p.position, p.id)
                     filter (where p.id is not null), '[]') as points
       from cases c join users u on u.id = c.owner_id
       left join points p on p.case_id = c.id
      where ($1::uuid is null or c.owner_id = $1)
      group by c.id, u.name, u.role
      order by c.created_at desc`,
    [scopeOwner(me)],
  );
}

export type PointEvent = {
  id: string;
  point_id: string;
  kind: "created" | "status" | "update" | "remark" | "due" | "reopen";
  text: string | null;
  status: Status | null;
  due: string | null;
  created_at: Date;
  user_name: string | null;
  user_role: "lead" | "member" | null;
};

export type PointFull = {
  id: string;
  position: number;
  text: string;
  source_quote: string | null;
  status: Status;
  wait_reason: string | null;
  due: string | null;
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
};

export async function getCase(me: User, id: string): Promise<CaseFull | null> {
  if (!/^\d{1,12}$/.test(id)) return null;
  const c = await one<Omit<CaseFull, "points">>(
    `select c.id::text as id, c.owner_id, o.name as owner_name, o.role = 'lead' as owner_lead, cb.name as created_by_name, c.subject, c.summary,
            c.from_name, c.from_email, c.company, c.priority, c.deadline::text as deadline, c.email_to, c.email_sent,
            c.email_body, c.source, c.file_name, c.details, c.created_at
       from cases c join users o on o.id = c.owner_id left join users cb on cb.id = c.created_by
      where c.id = $1 and ($2::uuid is null or c.owner_id = $2)`,
    [id, scopeOwner(me)],
  );
  if (!c) return null;
  const points = await q<Omit<PointFull, "events">>(
    `select id::text as id, position, text, source_quote, status, wait_reason, due::text as due
       from points where case_id = $1 order by position, id`,
    [id],
  );
  const events = points.length
    ? await q<PointEvent>(
        `select e.id::text as id, e.point_id::text as point_id, e.kind, e.text, e.status, e.due::text as due, e.created_at,
                u.name as user_name, u.role as user_role
           from point_events e left join users u on u.id = e.user_id
          where e.point_id = any($1::bigint[]) order by e.created_at, e.id`,
        [points.map((p) => p.id)],
      )
    : [];
  return { ...c, points: points.map((p) => ({ ...p, events: events.filter((e) => e.point_id === p.id) })) };
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
  last_update: string | null;
  last_at: Date | null;
};

export async function listPoints(me: User): Promise<BoardPoint[]> {
  return q<BoardPoint>(
    `select p.id::text as id, p.case_id::text as case_id, p.position, p.text, p.status, p.wait_reason, p.due::text as due,
            c.subject, c.priority, c.owner_id, u.name as owner_name, u.role = 'lead' as owner_lead,
            (select e.text from point_events e where e.point_id = p.id and e.kind = 'update' order by e.created_at desc limit 1) as last_update,
            (select max(e.created_at) from point_events e where e.point_id = p.id) as last_at
       from points p join cases c on c.id = p.case_id join users u on u.id = c.owner_id
      where ($1::uuid is null or c.owner_id = $1)
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
      where e.kind = 'remark' and c.owner_id = $1
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
      where ($1::uuid is null or c.owner_id = $1) and e.kind <> 'created'
      order by e.created_at desc limit $2`,
    [scopeOwner(me), limit],
  );
}

export type Assignee = { id: string; name: string; role: "lead" | "member" };

export async function assignees(): Promise<Assignee[]> {
  return q<Assignee>(`select id, name, role from users where status = 'active' order by (role = 'lead') desc, lower(name)`);
}

/** The Lead's name, for hints like "Irfan approves". */
export async function leadName(): Promise<string> {
  const r = await one<{ name: string }>("select name from users where role = 'lead' order by (status = 'active') desc, created_at limit 1");
  return r?.name ?? "the Lead";
}
