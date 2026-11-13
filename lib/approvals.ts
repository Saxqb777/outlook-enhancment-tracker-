// Approvals: who can see one, and loading lists and the full record.
import type { User } from "@/lib/auth";
import { one, q } from "@/lib/db";

export type ApprovalStatus = "open" | "signed" | "rejected" | "cancelled";
export type SignerState = "pending" | "signed" | "sent_back" | "rejected";
export const apRef = (id: string | number) => `AP-${String(id).padStart(4, "0")}`;
export const AP_STATUS: Record<ApprovalStatus, string> = { open: "Waiting", signed: "Signed", rejected: "Rejected", cancelled: "Cancelled" };

/** Leads and the Admin see every approval; everyone else sees the ones they asked for or were asked to sign. */
const SEE = `($1::uuid is null or a.requester_id = $1 or exists (select 1 from approval_signers s where s.approval_id = a.id and s.user_id = $1))`;
const scope = (u: User) => (u.role === "member" ? u.id : null);

export type ApprovalRow = {
  id: string;
  title: string;
  status: ApprovalStatus;
  version: number;
  needed_by: string | null;
  created_at: Date;
  closed_at: Date | null;
  requester_id: string;
  requester: string;
  signers: { id: string; name: string; state: SignerState }[];
  files: number;
  mine: SignerState | null;
};

export async function listApprovals(me: User): Promise<ApprovalRow[]> {
  return q<ApprovalRow>(
    `select a.id::text as id, a.title, a.status, a.version, a.needed_by::text as needed_by, a.created_at, a.closed_at, a.requester_id, r.name as requester,
            (select coalesce(json_agg(json_build_object('id', u.id, 'name', u.name, 'state', s.state) order by lower(u.name)), '[]')
               from approval_signers s join users u on u.id = s.user_id where s.approval_id = a.id) as signers,
            (select count(*)::int from approval_files f where f.approval_id = a.id and f.version = a.version) as files,
            (select s.state from approval_signers s where s.approval_id = a.id and s.user_id = $2) as mine
       from approvals a join users r on r.id = a.requester_id
      where ${SEE} order by a.created_at desc limit 500`,
    [scope(me), me.id],
  );
}

export type ApprovalEvent = { id: string; kind: string; text: string | null; version: number; signature: string | null; created_at: Date; user_id: string | null; name: string | null };
export type ApprovalFull = {
  id: string;
  title: string;
  body: string;
  status: ApprovalStatus;
  version: number;
  needed_by: string | null;
  created_at: Date;
  closed_at: Date | null;
  requester_id: string;
  requester: string;
  signers: { id: string; name: string; state: SignerState; signed_version: number | null; signature: string | null; comment: string | null; decided_at: Date | null }[];
  files: { id: string; version: number; name: string; mime: string; size: number }[];
  events: ApprovalEvent[];
};

export async function getApproval(me: User, id: string): Promise<ApprovalFull | null> {
  if (!/^\d{1,12}$/.test(id)) return null;
  const a = await one<Omit<ApprovalFull, "signers" | "files" | "events">>(
    `select a.id::text as id, a.title, a.body, a.status, a.version, a.needed_by::text as needed_by, a.created_at, a.closed_at, a.requester_id, r.name as requester
       from approvals a join users r on r.id = a.requester_id where a.id = $2 and ${SEE}`,
    [scope(me), id],
  );
  if (!a) return null;
  const [signers, files, events] = await Promise.all([
    q<ApprovalFull["signers"][number]>(
      `select u.id, u.name, s.state, s.signed_version, s.signature, s.comment, s.decided_at
         from approval_signers s join users u on u.id = s.user_id where s.approval_id = $1 order by lower(u.name)`,
      [id],
    ),
    q<ApprovalFull["files"][number]>("select id::text as id, version, name, mime, size from approval_files where approval_id = $1 order by version, id", [id]),
    q<ApprovalEvent>(
      `select e.id::text as id, e.kind, e.text, e.version, e.signature, e.created_at, e.user_id, u.name
         from approval_events e left join users u on u.id = e.user_id where e.approval_id = $1 order by e.id`,
      [id],
    ),
  ]);
  return { ...a, signers, files, events };
}

/** How many approvals are waiting for this person's signature. */
export async function waitingForMe(userId: string): Promise<number> {
  const r = await one<{ n: number }>(
    "select count(*)::int as n from approval_signers s join approvals a on a.id = s.approval_id where s.user_id = $1 and s.state = 'pending' and a.status = 'open'",
    [userId],
  );
  return r?.n ?? 0;
}

export async function canSeeApprovalFile(me: User, fileId: string) {
  if (!/^\d{1,12}$/.test(fileId)) return null;
  return one<{ name: string; mime: string; storage: string; url: string }>(
    `select f.name, f.mime, f.storage, f.url from approval_files f join approvals a on a.id = f.approval_id where f.id = $2 and ${SEE}`,
    [scope(me), fileId],
  );
}
