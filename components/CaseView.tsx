"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { setCaseOwner, setPointAssignee, updateCase } from "@/app/actions/manage";
import { addPoint, postNote, reopenPoint, setCaseMembers, setPointStatus } from "@/app/actions/work";
import { AttachPicker, FileList, useAttach, type FileView } from "@/components/Attach";
import { ArchiveButton, askRemoveFile, PointFix } from "@/components/CaseFix";
import ChatPanel from "@/components/ChatPanel";
import { Highlighted, MailReader, type ReaderEmail } from "@/components/EmailInput";
import { Avatar, Icon } from "@/components/Icon";
import { Glyph, plural, Prio, SegBar, firstName } from "@/components/ui";
import { DueControl, Pop, run, StatusControl, toast, useViewOnly } from "@/components/work";
import type { Role } from "@/lib/auth";
import { segmentBody, type Segment } from "@/lib/highlight";
import { caseRef, PRIORITIES, STATUS_LABEL, type Priority, type Status } from "@/lib/status";
import { fmtDay, fmtShort, fmtWhen, todayISO } from "@/lib/time";

export type EventView = {
  id: string;
  email_id: string | null;
  kind: "created" | "status" | "update" | "remark" | "due" | "reopen" | "reply";
  text: string | null;
  status: Status | null;
  due: string | null;
  created_at: string;
  user_name: string | null;
  user_role: "lead" | "member" | "admin" | null;
  files: FileView[];
};
export type PointView = {
  id: string;
  email_id: string | null;
  text: string;
  source_quote: string | null;
  status: Status;
  wait_reason: string | null;
  due: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  events: EventView[];
};
export type EmailView = {
  id: string;
  position: number;
  from_name: string;
  from_email: string;
  email_to: string;
  email_sent: string;
  subject: string;
  body: string;
  file_name: string | null;
  change_note: string | null;
  added_by_name: string | null;
  created_at: string;
  file: { name: string; mime: string; size: number } | null;
};
export type CaseViewData = {
  id: string;
  owner_name: string;
  owner_lead: boolean;
  subject: string;
  summary: string;
  from_name: string;
  from_email: string;
  company: string;
  priority: Priority;
  deadline: string | null;
  details: { label: string; value: string }[];
  created_at: string;
  points: PointView[];
  emails: EmailView[];
  owner_id: string;
  archived?: boolean;
  members: { id: string; name: string; role: "lead" | "member"; added_by_name: string | null; added_at: string }[];
};

export type Person = { id: string; name: string; role: "lead" | "member" | "admin" };

const emailTab = (e: EmailView) => (e.position === 0 ? "Original" : `Reply ${e.position}`);
const emailName = (e: EmailView) => (e.position === 0 ? "Original email" : `Reply ${e.position}`);

export default function CaseView({
  c,
  role,
  leadName,
  today,
  startEmail,
  startChat,
  unread,
  people,
  canManage,
}: {
  c: CaseViewData;
  role: Role;
  leadName: string;
  today: string;
  startEmail: number | null;
  startChat: boolean;
  unread: number;
  people: Person[];
  canManage: boolean;
}) {
  const lead = role === "lead";
  const viewOnly = useViewOnly();
  const [tab, setTab] = useState<"points" | "email" | "chat">(startChat ? "chat" : "points");
  const [side, setSide] = useState<"points" | "chat">(startChat ? "chat" : "points");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [lit, setLit] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [moreSum, setMoreSum] = useState(false);
  const team: Person[] = [
    { id: c.owner_id, name: c.owner_name, role: c.owner_lead ? "lead" : "member" },
    ...c.members.map((m) => ({ id: m.id, name: m.name, role: m.role })),
  ];
  const [reader, setReader] = useState<{ i: number; view: "text" | "file" } | null>(null);
  const emails = c.emails;
  const last = emails.length ? emails[emails.length - 1].position : 0;
  const [sel, setSel] = useState<number>(startEmail !== null && emails.some((e) => e.position === startEmail) ? startEmail : last);
  const email = emails.find((e) => e.position === sel) ?? emails[0];
  const posOf = useMemo(() => new Map(emails.map((e) => [e.id, e.position])), [emails]);

  // Each point's home email (where its sentence came from), its highlight segments per email, and display numbers.
  const homeOf = (p: PointView) => (p.email_id ? (posOf.get(p.email_id) ?? null) : null);
  const perEmail = useMemo(() => {
    const out = new Map<number, { segments: Segment[]; matched: Set<number> }>();
    for (const e of emails) {
      const quotes = c.points.map((p) => (p.email_id === e.id || (!p.email_id && e.position === 0) ? p.source_quote : null));
      out.set(e.position, segmentBody(e.body, quotes));
    }
    return out;
  }, [emails, c.points]);
  const num = useMemo(() => {
    const m = new Map<number, number>();
    let k = 0;
    c.points.forEach((p, i) => {
      const home = homeOf(p) ?? 0;
      if (perEmail.get(home)?.matched.has(i + 1)) m.set(i + 1, ++k);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.points, perEmail]);

  const total = c.points.length;
  const approved = c.points.filter((p) => p.status === "approved").length;
  const closed = total > 0 && approved === total;
  const lf = leadName;

  useEffect(() => {
    const m = location.hash.match(/^#pt-(\d+)$/);
    if (!m) return;
    const id = m[1];
    setOpen((s) => new Set(s).add(id));
    requestAnimationFrame(() => document.getElementById(`pt-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  }, []);

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const fromSource = (n: number) => {
    const p = c.points[n - 1];
    if (!p) return;
    setTab("points");
    setOpen((s) => new Set(s).add(p.id));
    setLit(n);
    requestAnimationFrame(() => document.getElementById(`pt-${p.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };
  const showInEmail = (n: number) => {
    const p = c.points[n - 1];
    setSel(p ? (homeOf(p) ?? 0) : sel);
    setTab("email");
    setLit(n);
    setTimeout(() => document.querySelector(`.case-mail [data-src="${n}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
  };

  const meta = (e: EmailView): [string, string][] => {
    const m: [string, string][] = [["From", `${e.from_name || "Unknown"}${e.from_email ? ` <${e.from_email}>` : ""}`]];
    if (e.email_to) m.push(["To", e.email_to]);
    m.push(["Sent", e.email_sent || "Not in the email"]);
    m.push(["Added", `${e.added_by_name ?? "Someone"}, ${fmtWhen(e.created_at, today)}`]);
    if (e.file) m.push(["File", e.file.name]);
    return m;
  };
  const isPdf = (e: EmailView) => e.file?.mime === "application/pdf";
  const readerEmails: ReaderEmail[] = emails.map((e) => {
    const seg = perEmail.get(e.position);
    return {
      key: e.id,
      tab: emailTab(e),
      label: `${emailName(e)} · added by ${e.added_by_name ?? "someone"} · ${fmtWhen(e.created_at, today)}`,
      subject: e.subject || c.subject,
      meta: meta(e),
      body: seg ? <Highlighted segments={seg.segments} numbers={num} /> : e.body,
      note: e.position > 0 ? (e.change_note ? `What this reply changed: ${e.change_note}` : null) : null,
      fileUrl: e.file && isPdf(e) ? `/files/${e.id}` : null,
      downloadUrl: e.file ? `/files/${e.id}?download` : null,
      isPdf: isPdf(e),
      fileName: e.file?.name ?? null,
    };
  });
  const seg = perEmail.get(email?.position ?? 0);

  return (
    <div className="page-in">
      <header className="case-h">
        <div className="case-top">
          <Link className="back" href="/cases">
            <Icon name="back" size={15} />
            Cases
          </Link>
          <span className="cid big">{caseRef(c.id)}</span>
          {closed && <span className="stamp sm">Closed</span>}
          {c.archived && <span className="stamp sm">Archived</span>}
          <span className="sp" />
          {role === "lead" && !viewOnly && <ArchiveButton caseId={c.id} archived={!!c.archived} />}
          {canManage && !viewOnly && !editing && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(true)}>
              <Icon name="edit" size={14} />
              <span className="m-hide">Edit details</span>
            </button>
          )}
          <button
            type="button"
            className={`btn btn-sm chat-open${side === "chat" ? " on" : ""}`}
            onClick={() => {
              setSide("chat");
              setTab("chat");
              requestAnimationFrame(() => document.querySelector(".chat")?.scrollIntoView({ block: "center", behavior: "smooth" }));
            }}
          >
            <Icon name="chat" size={15} />
            Chat
            {unread > 0 && <span className="nav-badge blue">{unread}</span>}
          </button>
          {!viewOnly && (
            <Link className="btn btn-sm" href={`/cases/${c.id}/reply`}>
              <Icon name="reply" size={15} />
              Add a reply
            </Link>
          )}
          {!viewOnly && (
            <Link className="btn btn-sm" href={`/vendors/new?case=${c.id}`}>
              <Icon name="truck" size={15} />
              Ask vendors
            </Link>
          )}
        </div>
        {editing ? (
          <EditDetails c={c} onDone={() => setEditing(false)} />
        ) : (
          <>
            <h1 className="h1">{c.subject}</h1>
            {c.summary && (
              <p className={`lede case-sum${moreSum ? " all" : ""}`} onClick={() => setMoreSum((v) => !v)}>
                {c.summary}
              </p>
            )}
          </>
        )}
        <dl className="case-meta">
          <div>
            <dt>From</dt>
            <dd>
              {c.from_name || c.from_email || "Unknown sender"}
              {c.company ? ` · ${c.company}` : ""}
            </dd>
          </div>
          <div>
            <dt>{c.members.length ? "People" : "Owner"}</dt>
            <dd>
              <PeopleControl c={c} people={people} canManage={canManage && !viewOnly} today={today} />
            </dd>
          </div>
          <div>
            <dt>Priority</dt>
            <dd>
              <Prio level={c.priority} />
            </dd>
          </div>
          <div>
            <dt>Case deadline</dt>
            <dd>
              <DueControl due={c.deadline} status={closed ? "approved" : "todo"} today={today} caseId={c.id} label="Change the case deadline" />
            </dd>
          </div>
          <div>
            <dt>Progress</dt>
            <dd>
              <SegBar statuses={c.points.map((p) => p.status)} />
              <span className="tnum small">
                {approved} of {total} approved
              </span>
            </dd>
          </div>
          {emails.length > 1 && (
            <div>
              <dt>Emails</dt>
              <dd>
                <Icon name="mail" size={14} />
                Original + {plural(emails.length - 1, "reply").replace("replys", "replies")}
              </dd>
            </div>
          )}
        </dl>
      </header>

      <div className="seg tabs-m" role="group" aria-label="Show">
        <button type="button" aria-pressed={tab === "email"} onClick={() => setTab("email")}>
          <Icon name="mail" size={15} />
          {emails.length > 1 ? `Emails ${emails.length}` : "Email"}
        </button>
        <button type="button" aria-pressed={tab === "points"} onClick={() => (setTab("points"), setSide("points"))}>
          Points<span className="n">{total}</span>
        </button>
        <button type="button" aria-pressed={tab === "chat"} onClick={() => (setTab("chat"), setSide("chat"))} data-tour="chat">
          <Icon name="chat" size={15} />
          Chat
          {unread > 0 && <span className="nav-badge blue">{unread}</span>}
        </button>
      </div>

      <div className="case-grid" data-tab={tab}>
        <section className="case-mail" aria-label="Emails on this case">
          {emails.length > 1 && (
            <div className="seg mail-tabs" role="group" aria-label="Emails on this case">
              {emails.map((e) => (
                <button key={e.id} type="button" aria-pressed={e.position === sel} onClick={() => setSel(e.position)}>
                  {e.position > 0 && <Icon name="reply" size={13} />}
                  {emailTab(e)}
                </button>
              ))}
            </div>
          )}
          {email && (
            <article className="mail">
              <header className="mail-h">
                <div className="mail-top">
                  <span className={`mail-label${email.position > 0 ? " is-reply" : ""}`}>
                    {emailName(email)} · added by {email.added_by_name ?? "someone"} · {fmtWhen(email.created_at, today)}
                  </span>
                  <span className="sp" />
                  {email.file && (
                    <a
                      className="btn btn-sm btn-ghost"
                      href={isPdf(email) ? `/files/${email.id}` : `/files/${email.id}?download`}
                      target={isPdf(email) ? "_blank" : undefined}
                      rel="noopener noreferrer"
                      onClick={(ev) => {
                        if (isPdf(email)) {
                          ev.preventDefault();
                          setReader({ i: emails.indexOf(email), view: "file" });
                        }
                      }}
                    >
                      <Icon name="file" size={14} />
                      Original file
                    </a>
                  )}
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setReader({ i: emails.indexOf(email), view: "text" })}>
                    <Icon name="expand" size={14} />
                    Expand
                  </button>
                </div>
                <div className="mail-s">{email.subject || c.subject}</div>
                <dl className="mail-meta">
                  {meta(email).map(([k, v]) => (
                    <span key={k} style={{ display: "contents" }}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </span>
                  ))}
                </dl>
              </header>
              {email.position > 0 && email.change_note && (
                <div className="mail-change">
                  <Icon name="reply" size={14} />
                  <span>
                    <b>What this reply changed:</b> {email.change_note}
                  </span>
                </div>
              )}
              <div className="mail-b">
                {seg ? <Highlighted segments={seg.segments} numbers={num} lit={lit} onLit={setLit} onPick={fromSource} /> : email.body}
              </div>
              {email.position === 0 && c.details.length > 0 && (
                <div className="mail-d">
                  <h3>Also found in the email</h3>
                  <ul className="found">
                    {c.details.map((d, i) => (
                      <li key={i}>
                        <b>{d.label}</b>
                        <span>{d.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          )}
          {reader !== null && <MailReader emails={readerEmails} start={reader.i} startView={reader.view} onClose={() => setReader(null)} />}
        </section>

        <section className={`case-pts side-${side}`} aria-label="Points and chat">
          <div className="seg side-tabs" role="group" aria-label="Show">
            <button type="button" aria-pressed={side === "points"} onClick={() => (setSide("points"), setTab("points"))}>
              Points<span className="n">{total}</span>
            </button>
            <button type="button" aria-pressed={side === "chat"} onClick={() => (setSide("chat"), setTab("chat"))} data-tour="chat">
              <Icon name="chat" size={15} />
              Chat
              {unread > 0 && <span className="nav-badge blue">{unread}</span>}
            </button>
          </div>
          <div className="chat-slot">
            <ChatPanel caseId={c.id} points={c.points.map((p) => ({ id: p.id, text: p.text, status: p.status }))} role={role} leadName={lf} today={today} active={side === "chat"} />
          </div>
          <div className="pts-h">
            <h2>
              Points <span className="count">{total}</span>
            </h2>
            {num.size > 0 && <span className="hint d-only">Hover a point to see the sentence it came from</span>}
          </div>
          <ol className="pts">
            {c.points.map((p, i) => {
              const home = homeOf(p);
              return (
                <PointCard
                  key={p.id}
                  p={p}
                  n={num.get(i + 1) ?? null}
                  fromReply={home && home > 0 ? home : null}
                  posOf={posOf}
                  lit={lit === i + 1}
                  onHover={(on) => setLit(on && num.has(i + 1) && (home ?? 0) === sel ? i + 1 : null)}
                  open={open.has(p.id)}
                  onToggle={() => toggle(p.id)}
                  onShowSource={() => showInEmail(i + 1)}
                  role={role}
                  lead={lead}
                  leadName={lf}
                  ownerName={c.owner_name}
                  today={today}
                  viewOnly={viewOnly}
                  team={team}
                />
              );
            })}
          </ol>
          {viewOnly ? null : adding ? (
            <AddPointForm caseId={c.id} onDone={() => setAdding(false)} />
          ) : (
            <button type="button" className="add-pt" onClick={() => setAdding(true)}>
              <Icon name="plus" size={15} />
              Add a point
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

function PointCard({
  p,
  n,
  fromReply,
  posOf,
  lit,
  onHover,
  open,
  onToggle,
  onShowSource,
  role,
  lead,
  leadName,
  ownerName,
  today,
  viewOnly,
  team,
}: {
  p: PointView;
  n: number | null;
  fromReply: number | null;
  posOf: Map<string, number>;
  lit: boolean;
  onHover: (on: boolean) => void;
  open: boolean;
  onToggle: () => void;
  onShowSource: () => void;
  role: Role;
  lead: boolean;
  leadName: string;
  ownerName: string;
  today: string;
  viewOnly: boolean;
  team: Person[];
}) {
  const ups = p.events.filter((e) => e.kind === "update").length;
  const fileCount = p.events.reduce((n, e) => n + e.files.length, 0);
  const doneEvent = p.status === "done" ? [...p.events].reverse().find((e) => e.kind === "status" && e.status === "done") : undefined;
  const doneFiles = doneEvent?.files ?? [];
  const rms = p.events.filter((e) => e.kind === "remark").length;
  const appr = p.status === "approved" ? [...p.events].reverse().find((e) => e.kind === "status" && e.status === "approved") : undefined;
  const [pending, start] = useTransition();

  return (
    <li
      className={`pt${open ? " open" : ""}${lit ? " lit" : ""}${p.status === "approved" ? " is-approved" : ""}`}
      id={`pt-${p.id}`}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <div className="pt-row">
        {n ? (
          <button type="button" className="tag" title="Show in the email" onClick={onShowSource}>
            {n}
          </button>
        ) : (
          <span className="tag tag-none" title="Added by hand">
            +
          </span>
        )}
        <div>
          <button type="button" className="pt-text" aria-expanded={open} onClick={onToggle}>
            {p.text}
          </button>
          {p.status === "wait" && p.wait_reason && (
            <div className="pt-wait">
              <Icon name="clock" size={14} />
              <span>Waiting on: {p.wait_reason}</span>
            </div>
          )}
          <div className="pt-meta">
            <StatusControl pointId={p.id} status={p.status} role={role} leadName={leadName} />
            <DueControl due={p.due} status={p.status} today={today} pointId={p.id} />
            {team.length > 1 && <AssignControl p={p} team={team} disabled={viewOnly} />}
            {fromReply && (
              <span className="from-reply" title={`This point came from Reply ${fromReply}`}>
                <Icon name="reply" size={13} />
                From Reply {fromReply}
              </span>
            )}
            {fileCount > 0 && (
              <span className="pt-count" title="Files attached to this point">
                <Icon name="clip" size={14} />
                {fileCount}
              </span>
            )}
            {ups + rms > 0 && (
              <span className="pt-count">
                <Icon name="msg" size={14} />
                {plural(ups, "update")}
                {rms ? ` · ${plural(rms, "remark")}` : ""}
              </span>
            )}
            {p.status === "approved" && (
              <span className="stamp">
                <Icon name="check" size={13} />
                Approved{appr ? ` · ${fmtShort(todayISO(new Date(appr.created_at)))}` : ""}
              </span>
            )}
          </div>
        </div>
        <button type="button" className="pt-tog" aria-expanded={open} aria-label={open ? "Hide updates" : "Show updates"} onClick={onToggle}>
          <Icon name="chevD" />
        </button>
      </div>
      {open && (
        <div className="pt-body">
          {lead && !viewOnly && <PointFix pointId={p.id} text={p.text} />}
          {p.status === "done" &&
            (lead && !viewOnly ? (
              <div className={`review${pending ? " is-busy" : ""}`}>
                <Glyph s="done" />
                <span>
                  <b>{firstName(ownerName)}</b> marked this done{doneFiles.length ? ` with ${plural(doneFiles.length, "file")}` : ""}.
                </span>
                <span className="sp" />
                <button type="button" className="btn btn-sm" onClick={() => start(async () => void (await run(reopenPoint(p.id))))}>
                  Reopen
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() =>
                    start(async () => {
                      if (await run(setPointStatus(p.id, "approved"))) toast("Approved.");
                    })
                  }
                >
                  <Icon name="check" size={14} />
                  Approve
                </button>
              </div>
            ) : (
              <div className="review note">
                <Glyph s="done" />
                <span>Marked done. Waiting for {leadName} to approve it.</span>
              </div>
            ))}
          {doneFiles.length > 0 && (
            <div className="review-files">
              <FileList files={doneFiles} onRemove={lead && !viewOnly ? askRemoveFile : undefined} />
            </div>
          )}
          {p.events.length ? (
            <ol className="tl">
              {p.events.map((e) => (
                <TimelineItem key={e.id} e={e} today={today} reply={e.email_id ? (posOf.get(e.email_id) ?? 0) : 0} canFix={lead && !viewOnly} />
              ))}
            </ol>
          ) : (
            <p className="hint" style={{ margin: 0 }}>
              No updates yet.
            </p>
          )}
          {!viewOnly && <Composer pointId={p.id} lead={lead} ownerName={ownerName} />}
          {n && (
            <button type="button" className="link-btn m-only" onClick={onShowSource}>
              Show this in the email
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function TimelineItem({ e, today, reply, canFix = false }: { e: EventView; today: string; reply: number; canFix?: boolean }) {
  const name = e.user_name ?? "Someone";
  const when = <time dateTime={e.created_at}>{fmtWhen(e.created_at, today)}</time>;
  const via = reply > 0 ? <span className="via">from Reply {reply}</span> : null;
  if (e.kind === "update" || e.kind === "remark") {
    return (
      <li>
        <Avatar name={name} lead={e.user_role === "lead"} />
        <div>
          <div className="who">
            <b>{name}</b>
            <span className={`kind${e.kind === "remark" ? " remark" : ""}`}>{e.kind === "remark" ? "Remark" : "Update"}</span>
            {when}
          </div>
          {e.text ? <div className="txt">{e.text}</div> : <div className="txt muted">Attached {plural(e.files.length, "file")}</div>}
          <FileList files={e.files} onRemove={canFix ? askRemoveFile : undefined} />
        </div>
      </li>
    );
  }
  if (e.kind === "reply") {
    return (
      <li>
        <span className="sys-g reply-g">
          <Icon name="reply" size={15} />
        </span>
        <div>
          <div className="who">
            <b>{firstName(name)}</b>
            <span className="kind reply">Reply {reply || ""}</span>
            {when}
          </div>
          <div className="txt">{e.text}</div>
        </div>
      </li>
    );
  }
  const who = <b>{firstName(name)}</b>;
  let glyph: React.ReactNode = <Icon name="dot" size={15} />;
  let text: React.ReactNode;
  if (e.kind === "status" && e.status) {
    glyph = <Glyph s={e.status} />;
    text =
      e.status === "approved" ? (
        <>{who} approved this point</>
      ) : e.status === "wait" ? (
        <>
          {who} set this to Waiting{e.text ? `: ${e.text}` : ""}
        </>
      ) : (
        <>
          {who} moved this to {STATUS_LABEL[e.status]}
        </>
      );
  } else if (e.kind === "reopen") {
    glyph = <Icon name="undo" size={15} />;
    text = <>{who} reopened this point</>;
  } else if (e.kind === "due") {
    glyph = <Icon name="cal" size={15} />;
    text = e.due ? (
      <>
        {who} set the deadline to {fmtDay(e.due)}
      </>
    ) : (
      <>{who} removed the deadline</>
    );
  } else {
    text = <>{who} added this point</>;
  }
  return (
    <li className={`sys${e.files.length ? " has-files" : ""}`}>
      <span className="sys-g">{glyph}</span>
      <div>
        <div className="who">
          <span>{text}</span>
          {via}
          {when}
        </div>
        <FileList files={e.files} onRemove={canFix ? askRemoveFile : undefined} />
      </div>
    </li>
  );
}

function Composer({ pointId, lead, ownerName }: { pointId: string; lead: boolean; ownerName: string }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const att = useAttach(pointId);
  const ref = useRef<HTMLFormElement>(null);
  const id = `cmp-${pointId}`;
  const submit = () => {
    const body = text.trim();
    const files = att.uploaded;
    if ((!body && !files.length) || pending || att.busy) return;
    start(async () => {
      if (await run(postNote(pointId, body, files))) {
        setText("");
        att.clear();
      }
    });
  };
  return (
    <form
      ref={ref}
      className="comp"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="sr" htmlFor={id}>
        {lead ? "Remark" : "Update"}
      </label>
      <textarea
        id={id}
        className="inp"
        rows={2}
        maxLength={2000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={lead ? `Add a remark for ${firstName(ownerName)}` : "What changed? Post an update"}
      />
      <div className="comp-f">
        <AttachPicker att={att} compact />
        <span className="sp" />
        <span className="hint m-hide">Ctrl + Enter to post</span>
        <button className="btn btn-sm btn-primary" type="submit" disabled={pending || att.busy || (!text.trim() && !att.uploaded.length)} aria-busy={pending}>
          {pending ? <span className="spinner" aria-hidden="true" /> : null}
          {att.busy ? "Uploading…" : lead ? "Add remark" : "Post update"}
        </button>
      </div>
    </form>
  );
}

function AddPointForm({ caseId, onDone }: { caseId: string; onDone: () => void }) {
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="addpt"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        start(async () => {
          if (await run(addPoint(caseId, text.trim(), due || null))) onDone();
        });
      }}
    >
      <label className="sr" htmlFor="np-t">
        New point
      </label>
      <input id="np-t" className="inp" placeholder="What needs to be done?" autoComplete="off" autoFocus maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
      <label className="sr" htmlFor="np-d">
        Deadline
      </label>
      <input id="np-d" type="date" className="inp" value={due} onChange={(e) => setDue(e.target.value)} />
      <button type="button" className="btn" onClick={onDone}>
        Cancel
      </button>
      <button className="btn btn-primary" type="submit" disabled={pending || !text.trim()}>
        {pending ? <span className="spinner" aria-hidden="true" /> : null}
        Add point
      </button>
    </form>
  );
}

/** Owner plus anyone else working on the case. The Lead or the owner can add or remove people. */
function PeopleControl({ c, people, canManage, today }: { c: CaseViewData; people: Person[]; canManage: boolean; today: string }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set(c.members.map((m) => m.id)));
  const [owner, setOwner] = useState(c.owner_id);
  const [keep, setKeep] = useState(true);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const btn = useRef<HTMLButtonElement>(null);
  const everyone = people.filter((p) => p.role !== "admin");
  const choices = everyone.filter((p) => p.id !== owner);
  const names = [firstName(c.owner_name), ...c.members.map((m) => firstName(m.name))];
  const moving = owner !== c.owner_id;
  const save = () =>
    start(async () => {
      if (moving && !(await run(setCaseOwner(c.id, owner, keep, note)))) return;
      const ids = [...picked].filter((id) => id !== owner);
      if (moving && keep) ids.push(c.owner_id);
      if (await run(setCaseMembers(c.id, ids))) {
        setOpen(false);
        setNote("");
        toast(moving ? `Handed over to ${firstName(everyone.find((p) => p.id === owner)?.name)}.` : "People on this case updated.");
      }
    });
  return (
    <span className="people">
      <span className="av-stack" title={[c.owner_name + " (owner)", ...c.members.map((m) => `${m.name}${m.added_by_name ? `, added by ${firstName(m.added_by_name)} ${fmtWhen(m.added_at, today)}` : ""}`)].join("\n")}>
        <Avatar name={c.owner_name} lead={c.owner_lead} size="xs" />
        {c.members.map((m) => (
          <Avatar key={m.id} name={m.name} lead={m.role === "lead"} size="xs" />
        ))}
      </span>
      <span>{c.members.length ? names.join(", ") : c.owner_name}</span>
      {canManage && (
        <>
          <button
            ref={btn}
            type="button"
            className={`btn btn-sm btn-ghost people-btn${pending ? " is-busy" : ""}`}
            onClick={() => {
              setPicked(new Set(c.members.map((m) => m.id)));
              setOwner(c.owner_id);
              setOpen((v) => !v);
            }}
            aria-haspopup="dialog"
            aria-expanded={open}
          >
            <Icon name="team" size={13} />
            {c.members.length ? "Assign people" : "Assign people"}
          </button>
          {open && (
            <Pop anchor={btn.current} onClose={() => setOpen(false)} label="People on this case">
              <div className="menu-form wide">
                <div className="menu-form-h">
                  <Icon name="team" size={16} />
                  <b>People on this case</b>
                </div>
                <label htmlFor="pc-owner">Owner</label>
                <select id="pc-owner" className="inp" value={owner} onChange={(e) => setOwner(e.target.value)}>
                  {everyone.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.id === c.owner_id ? " (now)" : ""}
                    </option>
                  ))}
                </select>
                {moving && (
                  <>
                    <label className="chg-row">
                      <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
                      <span>Keep {firstName(c.owner_name)} on the case</span>
                    </label>
                    <input className="inp" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Handover note (optional)" maxLength={300} />
                  </>
                )}
                <label>Also working on it</label>
                {choices.filter((p) => !(moving && p.id === c.owner_id)).length ? (
                  <ul className="pick-list">
                    {choices
                      .filter((p) => !(moving && p.id === c.owner_id))
                      .map((p) => (
                        <li key={p.id}>
                          <label className="chg-row">
                            <input
                              type="checkbox"
                              checked={picked.has(p.id)}
                              onChange={(e) =>
                                setPicked((s) => {
                                  const n = new Set(s);
                                  if (e.target.checked) n.add(p.id);
                                  else n.delete(p.id);
                                  return n;
                                })
                              }
                            />
                            <Avatar name={p.name} lead={p.role === "lead"} size="xs" />
                            <span>{p.name}</span>
                            <span className="hint">{p.role === "lead" ? "Lead" : "Member"}</span>
                          </label>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="hint">Nobody else on the team yet.</p>
                )}
                <div className="form-f">
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn-sm btn-primary" onClick={save} disabled={pending}>
                    {moving ? "Hand over" : "Save"}
                  </button>
                </div>
              </div>
            </Pop>
          )}
        </>
      )}
    </span>
  );
}

/** Who is doing this point (shared cases). */
function AssignControl({ p, team, disabled }: { p: PointView; team: Person[]; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const btn = useRef<HTMLButtonElement>(null);
  const label = p.assignee_name ? firstName(p.assignee_name) : "Assign";
  if (disabled) return p.assignee_name ? <span className="assignee">{label}</span> : null;
  const pick = (id: string | null) => {
    setOpen(false);
    start(async () => void (await run(setPointAssignee(p.id, id))));
  };
  return (
    <>
      <button ref={btn} type="button" className={`assignee${p.assignee_id ? "" : " none"}${pending ? " is-busy" : ""}`} onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} title="Who is doing this point">
        {p.assignee_name ? <Avatar name={p.assignee_name} size="xs" /> : <Icon name="plus" size={12} />}
        {label}
      </button>
      {open && (
        <Pop anchor={btn.current} onClose={() => setOpen(false)} label="Who is doing this point">
          <div className="menu-h">Who is doing this?</div>
          {team.map((m) => (
            <button key={m.id} type="button" className={`mi${p.assignee_id === m.id ? " cur" : ""}`} onClick={() => pick(m.id)}>
              <Avatar name={m.name} lead={m.role === "lead"} size="xs" />
              <span>{m.name}</span>
              {p.assignee_id === m.id && <Icon name="check" size={15} />}
            </button>
          ))}
          {p.assignee_id && (
            <button type="button" className="mi danger" onClick={() => pick(null)}>
              No one in particular
            </button>
          )}
        </Pop>
      )}
    </>
  );
}

function EditDetails({ c, onDone }: { c: CaseViewData; onDone: () => void }) {
  const [subject, setSubject] = useState(c.subject);
  const [summary, setSummary] = useState(c.summary);
  const [company, setCompany] = useState(c.company);
  const [priority, setPriority] = useState<Priority>(c.priority);
  const [pending, start] = useTransition();
  return (
    <form
      className="panel edit-case"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          if (await run(updateCase(c.id, { subject, summary, company, priority }))) onDone();
        });
      }}
    >
      <div className="field">
        <label htmlFor="ec-t">Title</label>
        <input id="ec-t" className="inp inp-lg" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} required autoFocus />
      </div>
      <div className="field">
        <label htmlFor="ec-s">Summary</label>
        <textarea id="ec-s" className="inp" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={800} />
      </div>
      <div className="fields-row">
        <div className="field">
          <label htmlFor="ec-c">Company</label>
          <input id="ec-c" className="inp" value={company} onChange={(e) => setCompany(e.target.value)} maxLength={120} />
        </div>
        <div className="field">
          <span className="flabel">Priority</span>
          <div className="seg" role="radiogroup" aria-label="Priority">
            {PRIORITIES.map((v) => (
              <button key={v} type="button" role="radio" aria-checked={priority === v} onClick={() => setPriority(v)}>
                <Prio level={v} />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="form-f" style={{ padding: 0, border: 0 }}>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={pending || !subject.trim()}>
          Save details
        </button>
      </div>
    </form>
  );
}
