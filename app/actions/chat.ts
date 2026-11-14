"use server";

import { revalidatePath } from "next/cache";
import { aiBlocked } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { canSeeCase, markRead } from "@/lib/chat";
import { one, q, tx } from "@/lib/db";
import type { Uploaded } from "@/lib/attach-rules";
import { removeStored, verifyUploads } from "@/lib/attachments";
import { askCase } from "@/lib/extract";
import { STATUS_LABEL, type Status } from "@/lib/status";
import { todayISO } from "@/lib/time";

type Result = { ok: true } | { ok: false; error: string };
const VIEW_ONLY = { ok: false as const, error: "Admin is view only, so nothing can be posted from this account." };

export async function postMessage(caseId: string, text: string, pointId?: string | null, files?: Uploaded[]): Promise<Result> {
  const me = await requireUser();
  if (me.role === "admin") return VIEW_ONLY;
  const body = String(text ?? "").trim().slice(0, 4000);
  if (!(await canSeeCase(me, String(caseId)))) return { ok: false, error: "That case isn't available." };
  const checked = files?.length ? await verifyUploads("apv", files) : [];
  if (!Array.isArray(checked)) return { ok: false, error: checked.error };
  if (!body && !checked.length) return { ok: false, error: "Write a message or attach a file first." };
  const pid = pointId && /^\d{1,12}$/.test(pointId) ? ((await one<{ id: string }>("select id::text as id from points where id = $1 and case_id = $2", [pointId, caseId]))?.id ?? null) : null;
  await tx(async (c) => {
    const m = await c.query<{ id: string }>("insert into case_messages (case_id, user_id, kind, body, point_id) values ($1, $2, 'text', $3, $4) returning id", [caseId, me.id, body, pid]);
    for (const f of checked) await c.query("insert into chat_files (case_message_id, name, mime, size, storage, url, pathname) values ($1, $2, $3, $4, $5, $6, $7)", [m.rows[0].id, f.name, f.mime, f.size, f.storage, f.url, f.pathname]);
  });
  await markRead(me.id, String(caseId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Posts the question, then the AI's answer. Everyone on the case sees both. */
export async function askAI(caseId: string, question: string): Promise<Result> {
  const me = await requireUser();
  if (me.role === "admin") return VIEW_ONLY;
  const ask = String(question ?? "").trim().slice(0, 2000);
  if (!ask) return { ok: false, error: "Type your question first." };
  const id = String(caseId);
  if (!(await canSeeCase(me, id))) return { ok: false, error: "That case isn't available." };
  const blocked = await aiBlocked(me.id);
  if (blocked) return { ok: false, error: blocked };

  const [c, emails, points, history, chat] = await Promise.all([
    one<{ subject: string; summary: string; company: string; owner: string; deadline: string | null }>(
      "select c.subject, c.summary, c.company, u.name as owner, c.deadline::text as deadline from cases c join users u on u.id = c.owner_id where c.id = $1",
      [id],
    ),
    q<{ position: number; from_name: string; email_sent: string; body: string }>("select position, from_name, email_sent, body from case_emails where case_id = $1 order by position", [id]),
    q<{ text: string; status: Status; due: string | null; wait_reason: string | null; who: string | null }>(
      "select p.text, p.status, p.due::text as due, p.wait_reason, a.name as who from points p left join users a on a.id = p.assignee_id where p.case_id = $1 order by p.position, p.id",
      [id],
    ),
    q<{ line: string }>(
      `select to_char(e.created_at at time zone 'Asia/Dubai', 'DD Mon HH24:MI') || ' ' || coalesce(u.name, 'Someone') || ' [' || e.kind || coalesce(' ' || e.status, '') || '] ' || coalesce(e.text, '') as line
         from point_events e join points p on p.id = e.point_id left join users u on u.id = e.user_id
        where p.case_id = $1 and e.kind <> 'created' order by e.id desc limit 40`,
      [id],
    ),
    q<{ line: string }>(
      `select coalesce(u.name, case when m.kind = 'ai' then 'AI' else 'System' end) || ': ' || left(m.body, 600) as line
         from case_messages m left join users u on u.id = m.user_id where m.case_id = $1 order by m.id desc limit 20`,
      [id],
    ),
  ]);
  if (!c) return { ok: false, error: "That case isn't available." };
  const budget = Math.floor(240_000 / Math.max(1, emails.length));
  const context = `<case>
Title: ${c.subject}
Company: ${c.company}
Owner: ${c.owner}
Case deadline: ${c.deadline ?? "none"}
Summary: ${c.summary}
Points:
${points.map((p, i) => `${i + 1}. [${STATUS_LABEL[p.status]}${p.due ? `, due ${p.due}` : ""}${p.who ? `, ${p.who}` : ""}] ${p.text}${p.wait_reason && p.status === "wait" ? ` (waiting on: ${p.wait_reason})` : ""}`).join("\n") || "(none)"}
</case>

<emails>
${emails.map((e) => `--- ${e.position === 0 ? "Original" : `Reply ${e.position}`} from ${e.from_name}, sent ${e.email_sent}\n${e.body.slice(0, budget)}`).join("\n\n")}
</emails>

<history newest_first="true">
${history.map((h) => h.line).join("\n")}
</history>

<chat newest_first="true">
${chat.map((h) => h.line).join("\n")}
</chat>

Asked by: ${me.name} (${me.role === "lead" ? "Lead" : "Member"})`;

  await q("insert into case_messages (case_id, user_id, kind, body) values ($1, $2, 'text', $3)", [id, me.id, ask]);
  const started = Date.now();
  let r: Awaited<ReturnType<typeof askCase>>;
  try {
    r = await askCase(context, ask, points.length, todayISO());
  } catch (err) {
    console.error("askAI", err);
    r = { ok: false, error: "The AI couldn't answer right now. Try again in a moment." };
  }
  await q("insert into ai_reads (user_id, kind, ok, ms, chars, points, error) values ($1, 'chat', $2, $3, $4, $5, $6)", [
    me.id,
    r.ok,
    Date.now() - started,
    context.length,
    r.ok ? r.actions.length : null,
    r.ok ? null : r.error.slice(0, 300),
  ]).catch(() => {});
  if (!r.ok) {
    await q("insert into case_messages (case_id, kind, body) values ($1, 'system', $2)", [id, `The AI couldn't answer: ${r.error}`]);
    return { ok: true };
  }
  await q("insert into case_messages (case_id, kind, body, actions) values ($1, 'ai', $2, $3::jsonb)", [id, r.answer, JSON.stringify(r.actions)]);
  await markRead(me.id, id);
  return { ok: true };
}

/** A Lead removes a file that was sent in a chat by mistake (case chat or vendor chat). The message stays. */
export async function removeChatFile(fileId: string): Promise<Result> {
  const me = await requireUser();
  if (me.role === "admin") return VIEW_ONLY;
  if (me.role !== "lead") return { ok: false, error: "Only a Lead can remove a file from a chat." };
  if (!/^\d{1,12}$/.test(String(fileId))) return { ok: false, error: "That file isn't available." };
  const f = await one<{ id: string; name: string; storage: string; url: string; cm: string | null; rm: string | null }>("select id::text as id, name, storage, url, case_message_id::text as cm, rfq_message_id::text as rm from chat_files where id = $1", [fileId]);
  if (!f) return { ok: false, error: "That file isn't available." };
  await q("delete from chat_files where id = $1", [f.id]);
  // A message that was only that file would be left as an empty bubble: say what happened instead.
  await q("update case_messages m set body = '(file removed)' where m.id = $1 and m.body = '' and not exists (select 1 from chat_files x where x.case_message_id = m.id)", [f.cm]);
  await q("update rfq_messages m set body = '(file removed)' where m.id = $1 and m.body = '' and not exists (select 1 from chat_files x where x.rfq_message_id = m.id)", [f.rm]);
  await removeStored(f).catch(() => {});
  revalidatePath("/", "layout");
  return { ok: true };
}
