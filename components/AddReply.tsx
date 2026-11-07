"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addReply, readReply, type ReplyChangeView } from "@/app/actions/work";
import { EmailInputPanel, Highlighted, MailReader, takeHandoff, useEmailSource, useFileUrl } from "@/components/EmailInput";
import { Icon } from "@/components/Icon";
import { Glyph } from "@/components/ui";
import { MAX_EMAIL_CHARS, parseAddress, splitEmail } from "@/lib/email";
import { segmentBody } from "@/lib/highlight";
import { caseRef, closedStatus, STATUS_LABEL, type Status } from "@/lib/status";
import { fmtDay } from "@/lib/time";

type CasePoint = { id: string; text: string; status: Status; due: string | null };
type Change = ReplyChangeView & { include: boolean };
type NewPoint = { key: number; text: string; due: string; quote: string };
type Draft = {
  fromName: string;
  fromEmail: string;
  summary: string;
  useSummary: boolean;
  changes: Change[];
  newPoints: NewPoint[];
  deadline: string;
  nothingNew: boolean;
  ai: boolean;
};

let keySeq = 0;
const nextKey = () => ++keySeq;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function earliestDue(points: CasePoint[], changes: Change[], newPoints: NewPoint[]): string {
  const byId = new Map(changes.filter((c) => c.include).map((c) => [c.pointId, c]));
  const dues: string[] = [];
  for (const p of points) {
    const ch = byId.get(p.id);
    if (closedStatus(p.status) || ch?.done) continue;
    const d = ch?.due || p.due;
    if (d) dues.push(d);
  }
  for (const p of newPoints) if (p.text.trim() && p.due) dues.push(p.due);
  return dues.sort()[0] ?? "";
}

export default function AddReply({ caseId, subject, points, today }: { caseId: string; subject: string; points: CasePoint[]; today: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<"input" | "reading" | "review">("input");
  const src = useEmailSource(stage === "input");
  const { raw, file } = src;
  const fileUrl = useFileUrl(file);
  const [err, setErr] = useState<{ text: string; retry: boolean } | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [lit, setLit] = useState<number | null>(null);
  const [reader, setReader] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const reading = useRef(0);
  const auto = useRef(false);
  const mail = useMemo(() => splitEmail(raw), [raw]);

  useEffect(() => {
    const h = takeHandoff();
    if (!h) return;
    src.setRaw(h.raw);
    if (h.file) {
      src.setFile(h.file);
      src.setTab("upload");
    }
    auto.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (auto.current && raw.trim()) {
      auto.current = false;
      void read();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  useEffect(() => {
    if (stage !== "review") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [stage]);

  const read = async () => {
    const text = raw.trim();
    if (!text) return;
    if (text.length > MAX_EMAIL_CHARS) {
      setErr({ text: "This thread is too long to read in one go. Remove the oldest replies at the bottom and try again.", retry: false });
      return;
    }
    const ticket = ++reading.current;
    setErr(null);
    setRevealed(0);
    setStage("reading");
    window.scrollTo({ top: 0 });
    let r: Awaited<ReturnType<typeof readReply>>;
    try {
      r = await readReply(caseId, text);
    } catch {
      r = { ok: false, error: "The connection dropped while reading. Try again." };
    }
    if (ticket !== reading.current) return;
    if (!r.ok) {
      setErr({ text: r.error, retry: true });
      setStage("input");
      return;
    }
    for (let i = 1; i <= 3; i++) {
      await sleep(260);
      if (ticket !== reading.current) return;
      setRevealed(i);
    }
    await sleep(450);
    if (ticket !== reading.current) return;
    const from = parseAddress(mail.from);
    const changes = r.data.changes.map((c) => ({ ...c, include: true }));
    const newPoints = r.data.newPoints.map((p) => ({ key: nextKey(), ...p }));
    setDraft({
      fromName: r.data.senderName || from.name,
      fromEmail: r.data.senderEmail || from.email,
      summary: r.data.summary,
      useSummary: !!r.data.summary,
      changes,
      newPoints,
      deadline: earliestDue(points, changes, newPoints),
      nothingNew: r.data.nothingNew && !changes.length && !newPoints.length,
      ai: true,
    });
    setStage("review");
    window.scrollTo({ top: 0 });
  };

  const manual = () => {
    const from = parseAddress(mail.from);
    setErr(null);
    setDraft({
      fromName: from.name,
      fromEmail: from.email,
      summary: "",
      useSummary: false,
      changes: [],
      newPoints: [],
      deadline: earliestDue(points, [], []),
      nothingNew: false,
      ai: false,
    });
    setStage("review");
  };

  const restart = () => {
    reading.current++;
    setStage("input");
    setDraft(null);
    setSaveErr(null);
  };

  const update = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const updateChange = (id: string, patch: Partial<Change>) =>
    setDraft((d) => (d ? { ...d, changes: d.changes.map((c) => (c.pointId === id ? { ...c, ...patch } : c)) } : d));
  const updatePoint = (key: number, patch: Partial<NewPoint>) =>
    setDraft((d) => (d ? { ...d, newPoints: d.newPoints.map((p) => (p.key === key ? { ...p, ...patch } : p)) } : d));

  const save = () => {
    if (!draft) return;
    setSaveErr(null);
    startSave(async () => {
      try {
        const fd = new FormData();
        if (file) fd.append("file", file.blob, file.name);
        const r = await addReply(
          caseId,
          {
            raw,
            source: file ? "file" : "paste",
            fileName: file?.name,
            fromName: draft.fromName,
            fromEmail: draft.fromEmail,
            summary: draft.useSummary ? draft.summary : null,
            deadline: draft.deadline,
            newPoints: draft.newPoints.filter((p) => p.text.trim()).map(({ text, due, quote }) => ({ text, due, quote })),
            changes: draft.changes.filter((c) => c.include).map(({ pointId, due, done, note, quote }) => ({ pointId, due, done, note, quote })),
          },
          fd,
        );
        if (!r.ok) return setSaveErr(r.error);
        router.push(`/cases/${caseId}?email=${r.position}`);
      } catch {
        setSaveErr("The reply didn't save. Check your connection and try again.");
      }
    });
  };

  // Highlights: changes show the existing point's number, new points the number they'll get.
  const quotes = draft ? [...draft.changes.map((c) => (c.include ? c.quote : "")), ...draft.newPoints.map((p) => p.quote)] : [];
  const { segments, matched } = useMemo(() => segmentBody(mail.body || raw, quotes), [mail.body, raw, quotes.join("\u0001")]); // eslint-disable-line react-hooks/exhaustive-deps
  const numbers = useMemo(() => {
    const m = new Map<number, number>();
    if (!draft) return m;
    draft.changes.forEach((c, i) => matched.has(i + 1) && m.set(i + 1, c.number));
    draft.newPoints.forEach((_, j) => matched.has(draft.changes.length + j + 1) && m.set(draft.changes.length + j + 1, points.length + j + 1));
    return m;
  }, [matched, draft, points.length]);

  const isPdf = !!file && /\.pdf$/i.test(file.name);
  const meta: [string, string][] = [["From", mail.from || "Not in the pasted text"]];
  if (mail.to) meta.push(["To", mail.to]);
  if (mail.sent) meta.push(["Sent", mail.sent]);
  const body = <Highlighted segments={segments} numbers={numbers} lit={lit} onLit={setLit} />;
  const preview = (marks: boolean) => (
    <article className="mail">
      <header className="mail-h">
        <div className="mail-top">
          <span className="mail-label is-reply">New reply{file ? ` · ${file.name}` : ""}</span>
          <span className="sp" />
          {marks && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setReader(true)}>
              <Icon name="expand" size={14} />
              Expand
            </button>
          )}
        </div>
        <div className="mail-s">{mail.subject || subject}</div>
        <dl className="mail-meta">
          {meta.map(([k, v]) => (
            <span key={k} style={{ display: "contents" }}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </span>
          ))}
        </dl>
      </header>
      <div className="mail-b">{marks ? body : mail.body || raw}</div>
      {reader && (
        <MailReader
          start={0}
          onClose={() => setReader(false)}
          emails={[
            {
              key: "reply",
              tab: "New reply",
              label: `New reply${file ? ` · ${file.name}` : ""}`,
              subject: mail.subject || subject,
              meta,
              body,
              fileUrl: isPdf ? fileUrl : null,
              downloadUrl: file && !isPdf ? fileUrl : null,
              isPdf,
              fileName: file?.name,
            },
          ]}
        />
      )}
    </article>
  );

  const head = (title: string, lede: string, actions?: React.ReactNode) => (
    <header className="ph">
      <div>
        <Link className="back" href={`/cases/${caseId}`}>
          <Icon name="back" size={15} />
          {caseRef(caseId)} · {subject}
        </Link>
        <h1 className="h1">{title}</h1>
        <p className="lede opt">{lede}</p>
      </div>
      {actions && <div className="ph-act">{actions}</div>}
    </header>
  );

  if (stage === "reading") {
    const steps = ["Finding what's new since the last email", "Checking it against the case's points", "Looking for new asks and moved dates"];
    return (
      <div className="page-in">
        {head(
          "Reading the reply",
          "Comparing it with what's already on the case. Usually 10 to 30 seconds.",
          <button type="button" className="btn btn-ghost" onClick={restart}>
            Cancel
          </button>,
        )}
        <div className="add-grid">
          <div className="reading">{preview(false)}</div>
          <section className="panel read-steps" aria-live="polite">
            <ol>
              {steps.map((label, i) => (
                <li key={label} className={revealed > i ? "ok" : ""}>
                  <span className="rs-g">
                    <svg className="spin" viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="30 60" strokeLinecap="round" />
                    </svg>
                    <Icon name="check" className="ck" />
                  </span>
                  <span>{label}</span>
                  <span className="rs-v" />
                </li>
              ))}
            </ol>
            <p className="hint read-note">You&apos;ll check every change before it&apos;s saved.</p>
          </section>
        </div>
      </div>
    );
  }

  if (stage === "review" && draft) {
    const included = draft.changes.filter((c) => c.include).length;
    return (
      <div className="page-in">
        {head(
          "Check what this reply changes",
          "Untick anything you don't want. Nothing changes on the case until you save.",
          <>
            <button type="button" className="btn btn-ghost m-hide" onClick={restart}>
              Start over
            </button>
            <button type="button" className="btn btn-primary m-hide" onClick={save} disabled={saving} aria-busy={saving}>
              {saving ? <span className="spinner" aria-hidden="true" /> : <Icon name="check" size={15} />}
              Save reply
            </button>
          </>,
        )}
        <div className="add-grid">
          <div className="sticky-col">{preview(true)}</div>
          <section className="panel rev-form" aria-label="Changes from this reply">
            <div className="rf">
              {draft.nothingNew && (
                <div className="ai-note">
                  <Icon name="check" size={16} />
                  <span>Nothing new to track in this reply. Save it so it&apos;s kept on the case, or add a point yourself below.</span>
                </div>
              )}
              {!draft.ai && (
                <div className="ai-note">
                  <Icon name="edit" size={16} />
                  <span>Add any new points yourself. The reply is saved on the case either way.</span>
                </div>
              )}

              {draft.changes.length > 0 && (
                <div className="field">
                  <div className="flabel-row">
                    <span className="flabel">
                      Changes to existing points <span className="count">{included}</span>
                    </span>
                  </div>
                  <ul className="chg-list">
                    {draft.changes.map((c) => (
                      <li key={c.pointId} className={`chg${c.include ? "" : " off"}`}>
                        <label className="chg-h">
                          <input type="checkbox" checked={c.include} onChange={(e) => updateChange(c.pointId, { include: e.target.checked })} />
                          <span className="tag">{c.number}</span>
                          <span className="chg-t">{c.text}</span>
                        </label>
                        <div className="chg-b">
                          <span className="chg-now">
                            Now: <Glyph s={c.status} /> {STATUS_LABEL[c.status]}
                            {c.currentDue ? ` · due ${fmtDay(c.currentDue)}` : " · no deadline"}
                          </span>
                          {(c.due || c.currentDue) && (
                            <label className="chg-row">
                              <span>New deadline</span>
                              <input
                                type="date"
                                className="inp inp-date"
                                value={c.due}
                                disabled={!c.include}
                                onChange={(e) => updateChange(c.pointId, { due: e.target.value })}
                              />
                            </label>
                          )}
                          {!closedStatus(c.status) && (
                            <label className="chg-row">
                              <input type="checkbox" checked={c.done} disabled={!c.include} onChange={(e) => updateChange(c.pointId, { done: e.target.checked })} />
                              <span>Mark as done</span>
                            </label>
                          )}
                          <label className="chg-row stack">
                            <span>Note on the point (from the reply)</span>
                            <input className="inp" value={c.note} disabled={!c.include} maxLength={300} onChange={(e) => updateChange(c.pointId, { note: e.target.value })} />
                          </label>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="field">
                <div className="flabel-row">
                  <span className="flabel">
                    New points <span className="count">{draft.newPoints.length}</span>
                  </span>
                  <span className="hint">Each one is tracked on its own</span>
                </div>
                <ol className="pe-list">
                  {draft.newPoints.map((p, j) => {
                    const idx = draft.changes.length + j + 1;
                    const n = numbers.get(idx);
                    return (
                      <li key={p.key} className={`pe${lit === idx ? " lit" : ""}`} onMouseEnter={() => n && setLit(idx)} onMouseLeave={() => setLit(null)}>
                        {n ? <span className="tag">{n}</span> : <span className="tag tag-none">+</span>}
                        <label className="sr" htmlFor={`rp-${p.key}`}>
                          New point
                        </label>
                        <input
                          id={`rp-${p.key}`}
                          className="inp pe-t"
                          value={p.text}
                          onChange={(e) => updatePoint(p.key, { text: e.target.value })}
                          placeholder="What needs to be done?"
                          maxLength={300}
                          autoComplete="off"
                        />
                        <label className="sr" htmlFor={`rd-${p.key}`}>
                          Deadline
                        </label>
                        <input id={`rd-${p.key}`} type="date" className="inp inp-date pe-d" value={p.due} onChange={(e) => updatePoint(p.key, { due: e.target.value })} />
                        <button
                          type="button"
                          className="icon-btn sm"
                          aria-label="Remove this new point"
                          onClick={() => update({ newPoints: draft.newPoints.filter((x) => x.key !== p.key) })}
                        >
                          <Icon name="x" size={15} />
                        </button>
                      </li>
                    );
                  })}
                  {!draft.newPoints.length && <li className="empty sm">No new asks in this reply.</li>}
                </ol>
                <button type="button" className="add-pt" onClick={() => update({ newPoints: [...draft.newPoints, { key: nextKey(), text: "", due: "", quote: "" }] })}>
                  <Icon name="plus" size={15} />
                  Add a point
                </button>
              </div>

              {draft.ai && draft.summary && (
                <div className="field">
                  <label className="chg-row">
                    <input type="checkbox" checked={draft.useSummary} onChange={(e) => update({ useSummary: e.target.checked })} />
                    <span className="flabel">Update the case summary</span>
                  </label>
                  <textarea className="inp" rows={3} value={draft.summary} disabled={!draft.useSummary} maxLength={800} onChange={(e) => update({ summary: e.target.value })} />
                </div>
              )}

              <div className="fields-row">
                <div className="field">
                  <label htmlFor="rp-from">Reply from</label>
                  <input id="rp-from" className="inp" value={draft.fromName} onChange={(e) => update({ fromName: e.target.value })} maxLength={120} autoComplete="off" />
                </div>
                <div className="field">
                  <label htmlFor="rp-deadline">Case deadline</label>
                  <input id="rp-deadline" type="date" className="inp" value={draft.deadline} onChange={(e) => update({ deadline: e.target.value })} />
                </div>
              </div>

              {saveErr && (
                <p className="form-err" role="alert">
                  {saveErr}
                </p>
              )}
            </div>
            <div className="form-f">
              <button type="button" className="btn btn-ghost" onClick={restart}>
                Start over
              </button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving} aria-busy={saving}>
                {saving ? <span className="spinner" aria-hidden="true" /> : <Icon name="check" size={15} />}
                {saving ? "Saving" : "Save reply"}
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="page-in">
      {head("Add a reply", "Paste the new reply or upload it. The whole thread is fine: only what's new is used. You check every change before it's saved.")}
      <EmailInputPanel
        src={src}
        readLabel="Read reply"
        onRead={() => void read()}
        placeholder={"Paste the reply here (the whole thread is fine).\nInclude the From and Sent lines if you have them."}
        err={
          err
            ? {
                text: err.text,
                actions:
                  err.retry && raw.trim() ? (
                    <>
                      <button type="button" className="btn btn-sm" onClick={() => void read()}>
                        Try again
                      </button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={manual}>
                        Save it without the AI
                      </button>
                    </>
                  ) : null,
              }
            : null
        }
      />
    </div>
  );
}
