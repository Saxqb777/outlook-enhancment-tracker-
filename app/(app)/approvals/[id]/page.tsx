import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DecideBox, PrintButton, ReplyBox, RequesterTools } from "@/components/Approvals";
import { progress, STATE_LABEL, STATUS_LABEL } from "@/lib/approval-labels";
import { Avatar, Icon, type IconName } from "@/components/Icon";
import { apRef, getApproval, type ApprovalEvent } from "@/lib/approvals";
import { isImage, sizeLabel } from "@/lib/attach-rules";
import { getViewer } from "@/lib/auth";
import { one } from "@/lib/db";
import { assignees } from "@/lib/work";
import { diffDays, fmtDay, fmtStamp, todayISO } from "@/lib/time";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: /^\d+$/.test(id) ? apRef(id) : "Approval" };
}

const EVENT: Record<string, { icon: IconName; say: string }> = {
  created: { icon: "plus", say: "asked for this approval" },
  signed: { icon: "sign", say: "signed" },
  sent_back: { icon: "reply", say: "sent it back" },
  rejected: { icon: "x", say: "rejected it. The request is closed" },
  reply: { icon: "chat", say: "replied" },
  new_version: { icon: "upload", say: "sent a corrected version" },
  cancelled: { icon: "x", say: "cancelled the request" },
  reminded: { icon: "clock", say: "sent a reminder" },
};

type FileRow = { id: string; version: number; name: string; mime: string; size: number };
function Files({ files }: { files: FileRow[] }) {
  if (!files.length) return null;
  return (
    <div className="files">
      {files.map((f) => {
        const view = f.mime === "application/pdf" || isImage(f.mime);
        return (
          <a key={f.id} className="file-chip" href={`/approvals/file/${f.id}${view ? "" : "?download"}`} target={view ? "_blank" : undefined} rel="noopener noreferrer">
            <Icon name="file" size={14} />
            <span className="file-n">{f.name}</span>
            <span className="file-s">{sizeLabel(f.size)}</span>
          </a>
        );
      })}
    </div>
  );
}

export default async function ApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { me, viewOnly } = await getViewer();
  const a = await getApproval(me, id);
  if (!a) notFound();
  const today = todayISO();
  const open = a.status === "open";
  const mine = a.signers.find((s) => s.id === me.id) ?? null;
  const isRequester = a.requester_id === me.id;
  const canSign = open && !viewOnly && !!mine && mine.state !== "signed";
  const canTalk = open && !viewOnly && (isRequester || !!mine);
  const saved = canSign ? ((await one<{ s: string | null }>("select saved_signature as s from users where id = $1", [me.id]))?.s ?? null) : null;
  const current = a.files.filter((f) => f.version === a.version);
  const older = [...new Set(a.files.filter((f) => f.version < a.version).map((f) => f.version))].sort((x, y) => y - x);
  const late = open && !!a.needed_by && diffDays(a.needed_by, today) < 0;
  const thread = a.events.filter((e) => e.kind !== "created");
  const who = (e: ApprovalEvent) => (e.user_id === me.id ? "You" : (e.name ?? "Someone"));

  return (
    <div className="page-in ap-page">
      <Link className="back no-print" href="/approvals">
        <Icon name="back" size={15} />
        Approvals
      </Link>
      <header className="ph">
        <div>
          <p className="ap-ref">
            <span className="cid">{apRef(a.id)}</span>
            <span className={`ap-st ${a.status}`}>{STATUS_LABEL[a.status]}</span>
            {a.version > 1 && <span className="ap-ver">Version {a.version}</span>}
          </p>
          <h1 className="h1">{a.title}</h1>
          <p className="lede">
            {isRequester ? "You" : a.requester} asked on {fmtStamp(a.created_at)}
            {a.needed_by && (
              <>
                {" · "}
                <span className={late ? "ap-late" : undefined}>needed by {fmtDay(a.needed_by)}</span>
              </>
            )}
            {open && <> · {progress(a.signers)}</>}
            {!open && a.closed_at && <> · {STATUS_LABEL[a.status].toLowerCase()} on {fmtStamp(a.closed_at)}</>}
          </p>
        </div>
        <div className="ph-act">
          <PrintButton />
        </div>
      </header>

      {canSign && mine && <DecideBox id={a.id} name={me.name} stamp={fmtStamp(new Date())} saved={saved} myState={mine.state} version={a.version} />}
      {open && isRequester && !viewOnly && (
        <div className="no-print">
          <RequesterTools
            id={a.id}
            body={a.body}
            anySigned={a.signers.some((s) => s.state === "signed")}
            waiting={a.signers.filter((s) => s.state === "pending").length}
            signers={a.signers.map((s) => ({ id: s.id, name: s.name, state: s.state }))}
            people={(await assignees()).filter((p) => p.id !== me.id).map((p) => ({ id: p.id, name: p.name }))}
          />
        </div>
      )}

      <div className="ap-grid">
        <section className="panel ap-doc" aria-label="What needs approving">
          <div className="panel-h">
            <h2>What needs approving</h2>
          </div>
          <div className="ap-doc-b">
            {a.body ? <p className="ap-body">{a.body}</p> : <p className="hint">See the attached document.</p>}
            <Files files={current} />
            {older.map((v) => (
              <details key={v} className="ap-old no-print">
                <summary>Documents from version {v}</summary>
                <Files files={a.files.filter((f) => f.version === v)} />
              </details>
            ))}
          </div>
        </section>

        <section className="panel ap-signers" aria-label="Signatures">
          <div className="panel-h">
            <h2>Signatures</h2>
            <span className="ap-bar small muted">
              <span className="segbar" aria-hidden="true">
                {a.signers.map((s) => (
                  <i key={s.id} className={s.state} />
                ))}
              </span>
              {a.signers.filter((s) => s.state === "signed").length} of {a.signers.length} signed
            </span>
          </div>
          <ul className="ap-sigs">
            {a.signers.map((s) => (
              <li key={s.id} className={`ap-sig ${s.state}`}>
                <div className="ap-sig-h">
                  <Avatar name={s.name} size="sm" />
                  <b>{s.id === me.id ? `${s.name} (you)` : s.name}</b>
                  <span className={`ap-st ${s.state === "pending" ? "open" : s.state === "sent_back" ? "back" : s.state}`}>{STATE_LABEL[s.state]}</span>
                </div>
                {s.state === "signed" && s.signature && (
                  <div className="ap-ink">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.signature} alt={`Signature of ${s.name}`} />
                    <span>
                      Signed {s.decided_at ? fmtStamp(s.decided_at) : ""}
                      {a.version > 1 ? ` · version ${s.signed_version}` : ""}
                    </span>
                  </div>
                )}
                {s.comment && <p className="ap-why">“{s.comment}”</p>}
                {s.state !== "signed" && s.state !== "pending" && s.decided_at && <span className="small muted">{fmtStamp(s.decided_at)}</span>}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel ap-thread" aria-label="Record">
        <div className="panel-h">
          <h2>Record</h2>
          <span className="small muted">Everything that happened, in order. It can't be edited.</span>
        </div>
        <ol className="ap-events">
          <li className="ap-ev">
            <span className="ap-ev-i">
              <Icon name="plus" size={14} />
            </span>
            <div>
              <p>
                <b>{isRequester ? "You" : a.requester}</b> asked {a.signers.map((s) => (s.id === me.id ? "you" : s.name)).join(", ")} to sign
              </p>
              <span className="small muted">{fmtStamp(a.created_at)}</span>
            </div>
          </li>
          {thread.map((e) => (
            <li key={e.id} className={`ap-ev ${e.kind}`}>
              <span className="ap-ev-i">
                <Icon name={EVENT[e.kind]?.icon ?? "dot"} size={14} />
              </span>
              <div>
                <p>
                  <b>{who(e)}</b> {EVENT[e.kind]?.say ?? e.kind}
                  {e.kind === "signed" && a.version > 1 ? ` version ${e.version}` : ""}
                  {e.kind === "new_version" ? ` (version ${e.version}). Everyone signs again` : ""}
                </p>
                {e.text && <p className="ap-ev-t">{e.text}</p>}
                {e.kind === "signed" && e.signature && e.version < a.version && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="ap-ev-sig" src={e.signature} alt={`Earlier signature of ${e.name ?? "signer"}`} />
                )}
                <span className="small muted">{fmtStamp(e.created_at)}</span>
              </div>
            </li>
          ))}
        </ol>
        {canTalk && (
          <div className="no-print">
            <ReplyBox id={a.id} />
          </div>
        )}
        {!open && <p className="ap-closed">This request is closed{a.status === "rejected" ? ". To try again, file a new request." : "."}</p>}
      </section>
      <p className="ap-foot">Agthia Enhancements · {apRef(a.id)} · internal sign-off record · printed {fmtStamp(new Date())}</p>
    </div>
  );
}
