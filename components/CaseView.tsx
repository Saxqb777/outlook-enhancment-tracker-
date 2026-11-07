"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addPoint, postNote, reopenPoint, setPointStatus } from "@/app/actions/work";
import { Avatar, Icon } from "@/components/Icon";
import { Glyph, plural, Prio, SegBar, firstName } from "@/components/ui";
import { DueControl, run, StatusControl, toast } from "@/components/work";
import type { Role } from "@/lib/auth";
import { segmentBody } from "@/lib/highlight";
import { caseRef, STATUS_LABEL, type Priority, type Status } from "@/lib/status";
import { fmtDay, fmtShort, fmtWhen, todayISO } from "@/lib/time";

export type EventView = {
  id: string;
  kind: "created" | "status" | "update" | "remark" | "due" | "reopen";
  text: string | null;
  status: Status | null;
  due: string | null;
  created_at: string;
  user_name: string | null;
  user_role: "lead" | "member" | null;
};
export type PointView = {
  id: string;
  text: string;
  source_quote: string | null;
  status: Status;
  wait_reason: string | null;
  due: string | null;
  events: EventView[];
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
  email_to: string;
  email_sent: string;
  email_body: string;
  file_name: string | null;
  details: { label: string; value: string }[];
  created_at: string;
  points: PointView[];
};

export default function CaseView({ c, role, leadName, today }: { c: CaseViewData; role: Role; leadName: string; today: string }) {
  const lead = role === "lead";
  const [tab, setTab] = useState<"points" | "email">("points");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [lit, setLit] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  // Which points came from a sentence we can find in the email, numbered in order.
  const { segments, num } = useMemo(() => {
    const seg = segmentBody(c.email_body, c.points.map((p) => p.source_quote));
    const num = new Map<number, number>();
    let k = 0;
    c.points.forEach((_, i) => {
      if (seg.matched.has(i + 1)) num.set(i + 1, ++k);
    });
    return { segments: seg.segments, num };
  }, [c.email_body, c.points]);

  const total = c.points.length;
  const approved = c.points.filter((p) => p.status === "approved").length;
  const closed = total > 0 && approved === total;
  const lf = firstName(leadName);

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
    const i = n - 1;
    const p = c.points[i];
    if (!p) return;
    setTab("points");
    setOpen((s) => new Set(s).add(p.id));
    setLit(n);
    requestAnimationFrame(() => document.getElementById(`pt-${p.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };
  const showInEmail = (n: number) => {
    setTab("email");
    setLit(n);
    requestAnimationFrame(() => document.querySelector(`[data-src="${n}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };

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
        </div>
        <h1 className="h1">{c.subject}</h1>
        {c.summary && <p className="lede">{c.summary}</p>}
        <dl className="case-meta">
          <div>
            <dt>From</dt>
            <dd>
              {c.from_name || c.from_email || "Unknown sender"}
              {c.company ? ` · ${c.company}` : ""}
            </dd>
          </div>
          <div>
            <dt>Owner</dt>
            <dd>
              <Avatar name={c.owner_name} lead={c.owner_lead} size="xs" />
              {c.owner_name}
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
        </dl>
      </header>

      <div className="seg tabs-m" role="group" aria-label="Show">
        <button type="button" aria-pressed={tab === "email"} onClick={() => setTab("email")}>
          <Icon name="mail" size={15} />
          Email
        </button>
        <button type="button" aria-pressed={tab === "points"} onClick={() => setTab("points")}>
          Points<span className="n">{total}</span>
        </button>
      </div>

      <div className="case-grid" data-tab={tab}>
        <section className="case-mail" aria-label="Original email">
          <article className="mail">
            <header className="mail-h">
              <div className="mail-s">{c.subject}</div>
              <dl className="mail-meta">
                <dt>From</dt>
                <dd>
                  {c.from_name || "Unknown"}
                  {c.from_email ? ` <${c.from_email}>` : ""}
                </dd>
                {c.email_to && (
                  <>
                    <dt>To</dt>
                    <dd>{c.email_to}</dd>
                  </>
                )}
                <dt>Received</dt>
                <dd>{c.email_sent || `Added ${fmtWhen(c.created_at, today)}`}</dd>
                {c.file_name && (
                  <>
                    <dt>File</dt>
                    <dd>{c.file_name}</dd>
                  </>
                )}
              </dl>
            </header>
            <div className="mail-b">
              {segments.map((s, i) =>
                s.n && num.has(s.n) ? (
                  <span
                    key={i}
                    className={`src${lit === s.n ? " lit" : ""}`}
                    data-src={s.n}
                    role="button"
                    tabIndex={0}
                    aria-label={`Point ${num.get(s.n)}`}
                    onMouseEnter={() => setLit(s.n!)}
                    onMouseLeave={() => setLit(null)}
                    onClick={() => fromSource(s.n!)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), fromSource(s.n!))}
                  >
                    <span className="tag" aria-hidden="true">
                      {num.get(s.n)}
                    </span>
                    {s.text}
                  </span>
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )}
            </div>
            {c.details.length > 0 && (
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
        </section>

        <section className="case-pts" aria-label="Points">
          <div className="pts-h">
            <h2>
              Points <span className="count">{total}</span>
            </h2>
            {num.size > 0 && <span className="hint d-only">Hover a point to see the sentence it came from</span>}
          </div>
          <ol className="pts">
            {c.points.map((p, i) => (
              <PointCard
                key={p.id}
                p={p}
                n={num.get(i + 1) ?? null}
                lit={lit === i + 1}
                onHover={(on) => setLit(on && num.has(i + 1) ? i + 1 : null)}
                open={open.has(p.id)}
                onToggle={() => toggle(p.id)}
                onShowSource={() => showInEmail(i + 1)}
                role={role}
                lead={lead}
                leadName={lf}
                ownerName={c.owner_name}
                today={today}
              />
            ))}
          </ol>
          {adding ? <AddPointForm caseId={c.id} onDone={() => setAdding(false)} /> : (
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
}: {
  p: PointView;
  n: number | null;
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
}) {
  const ups = p.events.filter((e) => e.kind === "update").length;
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
          <span className="tag">{n}</span>
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
          {p.status === "done" &&
            (lead ? (
              <div className={`review${pending ? " is-busy" : ""}`}>
                <Glyph s="done" />
                <span>
                  <b>{firstName(ownerName)}</b> marked this done.
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
          {p.events.length ? (
            <ol className="tl">
              {p.events.map((e) => (
                <TimelineItem key={e.id} e={e} today={today} />
              ))}
            </ol>
          ) : (
            <p className="hint" style={{ margin: 0 }}>
              No updates yet.
            </p>
          )}
          <Composer pointId={p.id} lead={lead} ownerName={ownerName} />
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

function TimelineItem({ e, today }: { e: EventView; today: string }) {
  const name = e.user_name ?? "Someone";
  const when = <time dateTime={e.created_at}>{fmtWhen(e.created_at, today)}</time>;
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
    <li className="sys">
      <span className="sys-g">{glyph}</span>
      <div className="who">
        <span>{text}</span>
        {when}
      </div>
    </li>
  );
}

function Composer({ pointId, lead, ownerName }: { pointId: string; lead: boolean; ownerName: string }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const id = `cmp-${pointId}`;
  const submit = () => {
    const body = text.trim();
    if (!body || pending) return;
    start(async () => {
      if (await run(postNote(pointId, body))) setText("");
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
        <span className="hint m-hide">Ctrl + Enter to post</span>
        <button className="btn btn-sm btn-primary" type="submit" disabled={pending || !text.trim()} aria-busy={pending}>
          {pending ? <span className="spinner" aria-hidden="true" /> : null}
          {lead ? "Add remark" : "Post update"}
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
