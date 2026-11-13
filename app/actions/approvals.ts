"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PoolClient } from "pg";
import type { Uploaded } from "@/lib/attach-rules";
import { verifyUploads, type Verified } from "@/lib/attachments";
import { requireUser, type User } from "@/lib/auth";
import { one, q, tx } from "@/lib/db";
import { isISODate } from "@/lib/time";

type Result = { ok: true } | { ok: false; error: string };
const VIEW_ONLY = { ok: false as const, error: "Admin is view only, so nothing can be changed from this account." };
const GONE = { ok: false as const, error: "That approval isn't available." };
const CLOSED = { ok: false as const, error: "This request is already closed." };
const isId = (v: unknown) => /^\d{1,12}$/.test(String(v));

function touch(id?: string) {
  revalidatePath("/approvals");
  revalidatePath("/", "layout");
  if (id) revalidatePath(`/approvals/${id}`);
}

type Ctx = { id: string; requester_id: string; status: string; version: number; my_state: string | null };
async function ctx(me: User, id: string, c?: PoolClient): Promise<Ctx | null> {
  if (!isId(id)) return null;
  const sql = `select a.id::text as id, a.requester_id, a.status, a.version,
                      (select s.state from approval_signers s where s.approval_id = a.id and s.user_id = $2) as my_state
                 from approvals a where a.id = $1${c ? " for update" : ""}`;
  return c ? ((await c.query<Ctx>(sql, [id, me.id])).rows[0] ?? null) : one<Ctx>(sql, [id, me.id]);
}
const log = (c: PoolClient, id: string, userId: string, kind: string, version: number, text?: string | null, signature?: string | null) =>
  c.query("insert into approval_events (approval_id, user_id, kind, text, version, signature) values ($1, $2, $3, $4, $5, $6)", [id, userId, kind, text || null, version, signature ?? null]);
async function saveFiles(c: PoolClient, id: string, version: number, files: Verified[]) {
  for (const f of files) {
    await c.query("insert into approval_files (approval_id, version, name, mime, size, storage, url, pathname) values ($1, $2, $3, $4, $5, $6, $7, $8)", [id, version, f.name, f.mime, f.size, f.storage, f.url, f.pathname]);
  }
}

export type NewApproval = { title: string; body: string; signerIds: string[]; neededBy: string; files: Uploaded[] };

export async function createApproval(input: NewApproval): Promise<Result> {
  const me = await requireUser();
  if (me.role === "admin") return VIEW_ONLY;
  const title = String(input?.title ?? "").trim().slice(0, 200);
  const body = String(input?.body ?? "").trim().slice(0, 20000);
  if (!title) return { ok: false, error: "Give the request a title." };
  const files = input.files?.length ? await verifyUploads("apv", input.files) : [];
  if (!Array.isArray(files)) return { ok: false, error: files.error };
  if (!body && !files.length) return { ok: false, error: "Write what needs approving, or attach the document." };
  const ids = [...new Set((Array.isArray(input.signerIds) ? input.signerIds : []).map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x) && x !== me.id))].slice(0, 10);
  const signers = ids.length ? await q<{ id: string }>("select id from users where id = any($1::uuid[]) and status = 'active' and role <> 'admin'", [ids]) : [];
  if (!signers.length) return { ok: false, error: "Pick at least one person to sign." };
  const id = await tx(async (c) => {
    const r = await c.query<{ id: string }>("insert into approvals (requester_id, title, body, needed_by) values ($1, $2, $3, $4) returning id::text as id", [me.id, title, body, isISODate(input.neededBy) ? input.neededBy : null]);
    const aid = r.rows[0].id;
    for (const s of signers) await c.query("insert into approval_signers (approval_id, user_id) values ($1, $2)", [aid, s.id]);
    await saveFiles(c, aid, 1, files);
    await log(c, aid, me.id, "created", 1);
    return aid;
  });
  touch(id);
  redirect(`/approvals/${id}`);
}

/** A signer signs the current version. `signature` is the drawn signature as a PNG data URL. */
export async function signApproval(id: string, signature: string, comment: string, save: boolean): Promise<Result> {
  const me = await requireUser();
  if (me.role === "admin") return VIEW_ONLY;
  const sig = String(signature ?? "");
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]{200,}$/.test(sig) || sig.length > 300_000) return { ok: false, error: "Draw your signature first." };
  const note = String(comment ?? "").trim().slice(0, 500);
  const r = await tx<Result>(async (c) => {
    const a = await ctx(me, id, c);
    if (!a || !a.my_state) return GONE;
    if (a.status !== "open") return CLOSED;
    if (a.my_state === "signed") return { ok: false, error: "You've already signed this version." };
    await c.query("update approval_signers set state = 'signed', signed_version = $1, signature = $2, comment = $3, decided_at = now() where approval_id = $4 and user_id = $5", [a.version, sig, note || null, a.id, me.id]);
    await log(c, a.id, me.id, "signed", a.version, note, sig);
    if (save) await c.query("update users set saved_signature = $1 where id = $2", [sig, me.id]);
    const left = await c.query("select 1 from approval_signers where approval_id = $1 and state <> 'signed' limit 1", [a.id]);
    await c.query(`update approvals set updated_at = now()${left.rowCount ? "" : ", status = 'signed', closed_at = now()"} where id = $1`, [a.id]);
    return { ok: true };
  });
  touch(id);
  return r;
}

/** A signer says no. `final` closes the whole request; otherwise it goes back to the requester to fix or explain. */
export async function declineApproval(id: string, reason: string, final: boolean): Promise<Result> {
  const me = await requireUser();
  if (me.role === "admin") return VIEW_ONLY;
  const why = String(reason ?? "").trim().slice(0, 2000);
  if (!why) return { ok: false, error: "Say why, so the person asking knows what to fix." };
  const r = await tx<Result>(async (c) => {
    const a = await ctx(me, id, c);
    if (!a || !a.my_state) return GONE;
    if (a.status !== "open") return CLOSED;
    await c.query("update approval_signers set state = $1, signature = null, signed_version = null, comment = $2, decided_at = now() where approval_id = $3 and user_id = $4", [final ? "rejected" : "sent_back", why, a.id, me.id]);
    await log(c, a.id, me.id, final ? "rejected" : "sent_back", a.version, why);
    await c.query(`update approvals set updated_at = now()${final ? ", status = 'rejected', closed_at = now()" : ""} where id = $1`, [a.id]);
    return { ok: true };
  });
  touch(id);
  return r;
}

/** A message in the request's thread, from the requester or one of the signers. */
export async function replyApproval(id: string, text: string): Promise<Result> {
  const me = await requireUser();
  if (me.role === "admin") return VIEW_ONLY;
  const body = String(text ?? "").trim().slice(0, 2000);
  if (!body) return { ok: false, error: "Write your reply first." };
  const a = await ctx(me, id);
  if (!a || (a.requester_id !== me.id && !a.my_state)) return GONE;
  if (a.status !== "open") return { ok: false, error: "This request is closed. File a new request to continue." };
  await tx(async (c) => {
    await log(c, a.id, me.id, "reply", a.version, body);
    await c.query("update approvals set updated_at = now() where id = $1", [a.id]);
  });
  touch(id);
  return { ok: true };
}

/** The requester sends a corrected version. Everyone signs the new version; old signatures stay in the record. */
export async function newVersion(id: string, input: { body: string; files: Uploaded[]; note: string }): Promise<Result> {
  const me = await requireUser();
  if (me.role === "admin") return VIEW_ONLY;
  const body = String(input?.body ?? "").trim().slice(0, 20000);
  const note = String(input?.note ?? "").trim().slice(0, 500);
  const files = input.files?.length ? await verifyUploads("apv", input.files) : [];
  if (!Array.isArray(files)) return { ok: false, error: files.error };
  const r = await tx<Result>(async (c) => {
    const a = await ctx(me, id, c);
    if (!a || a.requester_id !== me.id) return GONE;
    if (a.status !== "open") return CLOSED;
    const v = a.version + 1;
    await c.query("update approvals set version = $1, body = $2, updated_at = now() where id = $3", [v, body, a.id]);
    // No new document uploaded: the current documents carry over to the new version.
    if (files.length) await saveFiles(c, a.id, v, files);
    else
      await c.query(
        "insert into approval_files (approval_id, version, name, mime, size, storage, url, pathname) select approval_id, $2, name, mime, size, storage, url, pathname from approval_files where approval_id = $1 and version = $3 order by id",
        [a.id, v, a.version],
      );
    await c.query("update approval_signers set state = 'pending', signature = null, signed_version = null, comment = null, decided_at = null where approval_id = $1", [a.id]);
    await log(c, a.id, me.id, "new_version", v, note);
    return { ok: true };
  });
  touch(id);
  return r;
}

export async function cancelApproval(id: string): Promise<Result> {
  const me = await requireUser();
  if (me.role === "admin") return VIEW_ONLY;
  const r = await tx<Result>(async (c) => {
    const a = await ctx(me, id, c);
    if (!a || a.requester_id !== me.id) return GONE;
    if (a.status !== "open") return CLOSED;
    await c.query("update approvals set status = 'cancelled', closed_at = now(), updated_at = now() where id = $1", [a.id]);
    await log(c, a.id, me.id, "cancelled", a.version);
    return { ok: true };
  });
  touch(id);
  return r;
}

/** Nudges the people who haven't signed yet (at most once an hour). */
export async function remindSigners(id: string): Promise<Result> {
  const me = await requireUser();
  const a = await ctx(me, id);
  if (!a || a.requester_id !== me.id) return GONE;
  if (a.status !== "open") return CLOSED;
  const recent = await one("select 1 from approval_events where approval_id = $1 and kind = 'reminded' and created_at > now() - interval '1 hour'", [a.id]);
  if (recent) return { ok: false, error: "You reminded them less than an hour ago." };
  await q("insert into approval_events (approval_id, user_id, kind, version) values ($1, $2, 'reminded', $3)", [a.id, me.id, a.version]);
  return { ok: true };
}
