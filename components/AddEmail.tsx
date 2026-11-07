"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createCase, readEmail } from "@/app/actions/work";
import { Icon } from "@/components/Icon";
import { Prio } from "@/components/ui";
import type { Role } from "@/lib/auth";
import { MAX_EMAIL_CHARS, parseAddress, splitEmail } from "@/lib/email";
import type { Extraction } from "@/lib/extract";
import { segmentBody } from "@/lib/highlight";
import { readEmailFile } from "@/lib/mailfile";
import { PRIORITIES, PRIORITY_LABEL, type Priority } from "@/lib/status";
import { addDaysISO, fmtDay, fmtLongToday } from "@/lib/time";

type Person = { id: string; name: string; role: Role };
type DraftPoint = { key: number; text: string; due: string; quote: string };
type Draft = {
  subject: string;
  summary: string;
  fromName: string;
  fromEmail: string;
  company: string;
  priority: Priority;
  deadline: string;
  ownerId: string;
  points: DraftPoint[];
  details: { label: string; value: string }[];
  ai: boolean;
};

let keySeq = 0;
const nextKey = () => ++keySeq;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

function sample(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  const pretty = fmtLongToday(today);
  return `From: Lena Visser <lena.visser@gulfline.example>
Sent: ${pretty} ${y} 10:42
To: Operations <ops@agthia.example>
Subject: Arrival notice: 3 x 40' reefers of frozen poultry, Jebel Ali

Hi team,

Your shipment on MV Coral Dawn (B/L GLX-${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}-7781) arrives at Jebel Ali tomorrow. The containers are on the priority list for discharge.

Please send the import permit from the municipality by tomorrow. We also need the health certificate and the halal certificate for each container. Could you confirm the cold store slot before the end of the week? Finally, please pay the delivery order fees so we can release the cargo.

This is urgent for us, as free time at the port ends next week.

Kind regards,
Lena Visser
Import Coordinator, Gulfline Logistics`;
}

export default function AddEmail({ role, meId, people, today }: { role: Role; meId: string; people: Person[]; today: string }) {
  const lead = role === "lead";
  const [stage, setStage] = useState<"input" | "reading" | "review">("input");
  const [tab, setTab] = useState<"paste" | "upload">("paste");
  const [raw, setRaw] = useState("");
  const [file, setFile] = useState<{ name: string; size: number; note: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [found, setFound] = useState<Extraction | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [lit, setLit] = useState<number | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [over, setOver] = useState(false);
  const [opening, setOpening] = useState(false);
  const [errKind, setErrKind] = useState<"file" | "read">("read");
  const fileInput = useRef<HTMLInputElement>(null);
  const reading = useRef(0);

  const mail = useMemo(() => splitEmail(raw), [raw]);
  const words = raw.trim() ? raw.trim().split(/\s+/).length : 0;

  // Warn before leaving with an unsaved case.
  useEffect(() => {
    if (stage !== "review") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [stage]);

  const loadFile = async (f: File) => {
    setErr(null);
    setOpening(true);
    const r = await readEmailFile(f).finally(() => setOpening(false));
    if ("error" in r) {
      setErrKind("file");
      setErr(r.error);
      return;
    }
    setRaw(r.text);
    setFile({ name: f.name, size: f.size, note: r.note });
    setTab("upload");
    setStage("input");
  };

  // Drop an email file anywhere on the page while adding.
  useEffect(() => {
    if (stage !== "input") return;
    let depth = 0;
    const hasFile = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFile(e)) return;
      depth++;
      document.body.classList.add("filedrag");
    };
    const leave = (e: DragEvent) => {
      if (!hasFile(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) document.body.classList.remove("filedrag");
    };
    const overFn = (e: DragEvent) => {
      if (hasFile(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFile(e)) return;
      e.preventDefault();
      depth = 0;
      document.body.classList.remove("filedrag");
      const f = e.dataTransfer?.files?.[0];
      if (f) void loadFile(f);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", overFn);
    window.addEventListener("drop", drop);
    return () => {
      document.body.classList.remove("filedrag");
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", overFn);
      window.removeEventListener("drop", drop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const toDraft = (x: Extraction | null): Draft => {
    const from = parseAddress(mail.from);
    return {
      subject: x?.subject || mail.subject || "",
      summary: x?.summary ?? "",
      fromName: x?.senderName || from.name,
      fromEmail: x?.senderEmail || from.email,
      company: x?.company ?? "",
      priority: x?.priority ?? "normal",
      deadline: x?.caseDeadline ?? "",
      ownerId: meId,
      points: (x?.points ?? []).map((p) => ({ key: nextKey(), text: p.text, due: p.due, quote: p.quote })),
      details: x?.details ?? [],
      ai: !!x,
    };
  };

  const read = async () => {
    const text = raw.trim();
    if (!text) return;
    if (text.length > MAX_EMAIL_CHARS) {
      setErrKind("file");
      setErr(`This thread is too long to read in one go (${words.toLocaleString()} words). Remove the oldest replies at the bottom and try again.`);
      return;
    }
    const ticket = ++reading.current;
    setErr(null);
    setFound(null);
    setRevealed(0);
    setStage("reading");
    window.scrollTo({ top: 0, behavior: "smooth" });
    let r: Awaited<ReturnType<typeof readEmail>>;
    try {
      r = await readEmail(text);
    } catch {
      r = { ok: false, error: "The connection dropped while reading. Try again." };
    }
    if (ticket !== reading.current) return;
    if (!r.ok) {
      setErrKind("read");
      setErr(r.error);
      setStage("input");
      return;
    }
    setFound(r.data);
    for (let i = 1; i <= 4; i++) {
      await sleep(260);
      if (ticket !== reading.current) return;
      setRevealed(i);
    }
    await sleep(550);
    if (ticket !== reading.current) return;
    setDraft(toDraft(r.data));
    setStage("review");
    window.scrollTo({ top: 0 });
  };

  const manual = () => {
    setErr(null);
    setDraft({ ...toDraft(null), points: [{ key: nextKey(), text: "", due: "", quote: "" }] });
    setStage("review");
  };

  const restart = () => {
    reading.current++;
    setStage("input");
    setDraft(null);
    setFound(null);
    setSaveErr(null);
  };

  const update = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const updatePoint = (key: number, patch: Partial<DraftPoint>) =>
    setDraft((d) => (d ? { ...d, points: d.points.map((p) => (p.key === key ? { ...p, ...patch } : p)) } : d));

  const create = () => {
    if (!draft) return;
    setSaveErr(null);
    if (!draft.subject.trim()) return setSaveErr("Add a title before creating the case.");
    if (!draft.points.some((p) => p.text.trim())) return setSaveErr("Add at least one point. Each point is one thing to get done.");
    startSave(async () => {
      try {
        const r = await createCase({
          raw,
          source: file ? "file" : "paste",
          fileName: file?.name,
          subject: draft.subject,
          summary: draft.summary,
          fromName: draft.fromName,
          fromEmail: draft.fromEmail,
          company: draft.company,
          priority: draft.priority,
          deadline: draft.deadline,
          ownerId: draft.ownerId,
          details: draft.details,
          points: draft.points.map(({ text, due, quote }) => ({ text, due, quote })),
        });
        if (r && !r.ok) setSaveErr(r.error);
      } catch (e) {
        // A redirect after saving is not an error.
        if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
        setSaveErr("The case didn't save. Check your connection and try again.");
      }
    });
  };

  // ---------------------------------------------------------------- email preview with highlights
  const quotes = draft ? draft.points.map((p) => p.quote) : [];
  const { segments, matched } = useMemo(() => segmentBody(mail.body || raw, quotes), [mail.body, raw, quotes.join("\u0001")]); // eslint-disable-line react-hooks/exhaustive-deps
  const numbers = useMemo(() => {
    const m = new Map<number, number>();
    let k = 0;
    quotes.forEach((_, i) => matched.has(i + 1) && m.set(i + 1, ++k));
    return m;
  }, [matched, quotes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const preview = (marks: boolean) => (
    <article className="mail">
      <header className="mail-h">
        <div className="mail-s">{mail.subject || draft?.subject || found?.subject || "(No subject)"}</div>
        <dl className="mail-meta">
          <dt>From</dt>
          <dd>{mail.from || "Not in the pasted text"}</dd>
          {mail.to && (
            <>
              <dt>To</dt>
              <dd>{mail.to}</dd>
            </>
          )}
          {mail.sent && (
            <>
              <dt>Sent</dt>
              <dd>{mail.sent}</dd>
            </>
          )}
        </dl>
      </header>
      <div className="mail-b">
        {marks
          ? segments.map((s, i) =>
              s.n && numbers.has(s.n) ? (
                <span
                  key={i}
                  className={`src${lit === s.n ? " lit" : ""}`}
                  data-src={s.n}
                  onMouseEnter={() => setLit(s.n!)}
                  onMouseLeave={() => setLit(null)}
                  onClick={() => document.getElementById(`pe-${s.n}`)?.focus()}
                >
                  <span className="tag" aria-hidden="true">
                    {numbers.get(s.n)}
                  </span>
                  {s.text}
                </span>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )
          : mail.body || raw}
      </div>
    </article>
  );

  // ---------------------------------------------------------------- reading
  if (stage === "reading") {
    const steps: [string, string][] = [
      ["Sender and subject", found ? found.company || found.senderName || "Unknown sender" : ""],
      ["Dates and deadlines", found ? (found.caseDeadline ? fmtDay(found.caseDeadline) : "None found") : ""],
      ["Things being asked", found ? String(found.points.length) : ""],
      ["Priority", found ? PRIORITY_LABEL[found.priority] : ""],
    ];
    return (
      <div className="page-in">
        <header className="ph">
          <div>
            <h1 className="h1">Reading the email</h1>
            <p className="lede">Finding who sent it, what they need and by when. This usually takes 10 to 30 seconds; a long thread can take up to a minute.</p>
          </div>
          <div className="ph-act">
            <button type="button" className="btn btn-ghost" onClick={restart}>
              Cancel
            </button>
          </div>
        </header>
        <div className="add-grid">
          <div className="reading">{preview(false)}</div>
          <section className="panel read-steps" aria-live="polite">
            <ol>
              {steps.map(([label, value], i) => (
                <li key={label} className={revealed > i ? "ok" : ""}>
                  <span className="rs-g">
                    <svg className="spin" viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="30 60" strokeLinecap="round" />
                    </svg>
                    <Icon name="check" className="ck" />
                  </span>
                  <span>{label}</span>
                  <span className="rs-v">{value}</span>
                </li>
              ))}
            </ol>
            <p className="hint read-note">You&apos;ll check everything before it&apos;s saved.</p>
          </section>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- review
  if (stage === "review" && draft) {
    const owners = people.length ? people : [{ id: meId, name: "Me", role }];
    const quick: [string, string][] = [
      ["Today", today],
      ["Tomorrow", addDaysISO(today, 1)],
    ];
    return (
      <div className="page-in">
        <header className="ph">
          <div>
            <div className="date">Step 2 of 2</div>
            <h1 className="h1">Check what was found</h1>
            <p className="lede opt">Change anything that looks off. You know this work best. Nothing is saved until you create the case.</p>
          </div>
          <div className="ph-act m-hide">
            <button type="button" className="btn btn-ghost" onClick={restart}>
              Start over
            </button>
            <button type="button" className="btn btn-primary" onClick={create} disabled={saving} aria-busy={saving}>
              {saving ? <span className="spinner" aria-hidden="true" /> : <Icon name="check" size={15} />}
              Create case
            </button>
          </div>
        </header>
        <div className="add-grid">
          <div className="sticky-col">{preview(true)}</div>
          <section className="panel rev-form" aria-label="Case details">
            <div className="rf">
              {!draft.ai && (
                <div className="ai-note">
                  <Icon name="edit" size={16} />
                  <span>Fill in the details yourself. Each point is one thing to get done.</span>
                </div>
              )}
              <div className="field">
                <label htmlFor="dp-title">Title</label>
                <input id="dp-title" className="inp inp-lg" value={draft.subject} onChange={(e) => update({ subject: e.target.value })} maxLength={200} autoComplete="off" />
              </div>
              <div className="field">
                <label htmlFor="dp-summary">Summary</label>
                <textarea id="dp-summary" className="inp" rows={3} value={draft.summary} onChange={(e) => update({ summary: e.target.value })} maxLength={800} />
              </div>
              <div className="fields-row">
                <div className="field">
                  <label htmlFor="dp-from">From</label>
                  <input id="dp-from" className="inp" value={draft.fromName} onChange={(e) => update({ fromName: e.target.value })} maxLength={120} autoComplete="off" />
                </div>
                <div className="field">
                  <label htmlFor="dp-org">Company</label>
                  <input id="dp-org" className="inp" value={draft.company} onChange={(e) => update({ company: e.target.value })} placeholder="Client, carrier or agent" maxLength={120} autoComplete="off" />
                </div>
              </div>
              <div className="fields-row">
                <div className="field">
                  <span className="flabel" id="dp-prio-l">
                    Priority
                  </span>
                  <div className="seg" role="radiogroup" aria-labelledby="dp-prio-l">
                    {PRIORITIES.map((v) => (
                      <button key={v} type="button" role="radio" aria-checked={draft.priority === v} onClick={() => update({ priority: v })}>
                        <Prio level={v} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="dp-deadline">Case deadline</label>
                  <input id="dp-deadline" type="date" className="inp" value={draft.deadline} onChange={(e) => update({ deadline: e.target.value })} />
                </div>
              </div>
              {lead && (
                <div className="field">
                  <label htmlFor="dp-owner">Owner</label>
                  <select id="dp-owner" className="inp" value={draft.ownerId} onChange={(e) => update({ ownerId: e.target.value })}>
                    {owners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.id === meId ? " (you)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field">
                <div className="flabel-row">
                  <span className="flabel">
                    Points <span className="count">{draft.points.length}</span>
                  </span>
                  <span className="hint">Each one is tracked on its own</span>
                </div>
                <ol className="pe-list">
                  {draft.points.map((p, i) => {
                    const n = numbers.get(i + 1);
                    return (
                      <li key={p.key} className={`pe${lit === i + 1 ? " lit" : ""}`} onMouseEnter={() => n && setLit(i + 1)} onMouseLeave={() => setLit(null)}>
                        {n ? (
                          <span className="tag">{n}</span>
                        ) : (
                          <span className="tag tag-none" title="Not linked to a sentence">
                            +
                          </span>
                        )}
                        <label className="sr" htmlFor={`pe-${i + 1}`}>
                          Point {i + 1}
                        </label>
                        <input
                          id={`pe-${i + 1}`}
                          className="inp pe-t"
                          value={p.text}
                          onChange={(e) => updatePoint(p.key, { text: e.target.value })}
                          onFocus={() => n && setLit(i + 1)}
                          onBlur={() => setLit(null)}
                          placeholder="What needs to be done?"
                          maxLength={300}
                          autoComplete="off"
                        />
                        <label className="sr" htmlFor={`pd-${i + 1}`}>
                          Deadline for point {i + 1}
                        </label>
                        <input id={`pd-${i + 1}`} type="date" className="inp inp-date pe-d" value={p.due} onChange={(e) => updatePoint(p.key, { due: e.target.value })} />
                        <button type="button" className="icon-btn sm" aria-label={`Remove point ${i + 1}`} onClick={() => update({ points: draft.points.filter((x) => x.key !== p.key) })}>
                          <Icon name="x" size={15} />
                        </button>
                      </li>
                    );
                  })}
                  {!draft.points.length && <li className="empty sm">No clear asks were found. Add the points yourself.</li>}
                </ol>
                <button type="button" className="add-pt" onClick={() => update({ points: [...draft.points, { key: nextKey(), text: "", due: "", quote: "" }] })}>
                  <Icon name="plus" size={15} />
                  Add a point
                </button>
                {draft.points.some((p) => !p.due) && draft.points.length > 0 && (
                  <span className="hint">
                    No date on a point? Leave it empty, or use{" "}
                    {quick.map(([l, d], i) => (
                      <span key={l}>
                        {i > 0 && " or "}
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => update({ points: draft.points.map((p) => (p.due ? p : { ...p, due: d })) })}
                        >
                          {l.toLowerCase()}
                        </button>
                      </span>
                    ))}{" "}
                    for all of them.
                  </span>
                )}
              </div>
              {draft.details.length > 0 && (
                <div className="field">
                  <span className="flabel">Also found in the email</span>
                  <ul className="found">
                    {draft.details.map((d, i) => (
                      <li key={i}>
                        <b>{d.label}</b>
                        <span>{d.value}</span>
                        <button type="button" className="icon-btn sm" aria-label={`Remove ${d.label}`} onClick={() => update({ details: draft.details.filter((_, j) => j !== i) })}>
                          <Icon name="x" size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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
              <button type="button" className="btn btn-primary" onClick={create} disabled={saving} aria-busy={saving}>
                {saving ? <span className="spinner" aria-hidden="true" /> : <Icon name="check" size={15} />}
                {saving ? "Creating case" : "Create case"}
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- input
  return (
    <div className="page-in">
      <header className="ph">
        <div>
          <h1 className="h1">Add an email</h1>
          <p className="lede opt">Paste the email or upload the file. It finds the sender, the deadlines and each thing being asked. You check everything before it&apos;s saved.</p>
        </div>
      </header>
      <section className="panel add-card">
        <div className="panel-h">
          <div className="seg" role="group" aria-label="How to add">
            <button type="button" aria-pressed={tab === "paste"} onClick={() => setTab("paste")}>
              <Icon name="edit" size={15} />
              Paste text
            </button>
            <button type="button" aria-pressed={tab === "upload"} onClick={() => setTab("upload")}>
              <Icon name="upload" size={15} />
              Upload a file
            </button>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setRaw(sample(today));
              setFile(null);
              setTab("paste");
              setErr(null);
            }}
          >
            Use a sample email
          </button>
        </div>
        <div className="add-b">
          {tab === "paste" ? (
            <>
              <label className="sr" htmlFor="raw">
                Email text
              </label>
              <textarea
                id="raw"
                className="inp raw"
                spellCheck={false}
                value={raw}
                onChange={(e) => {
                  setRaw(e.target.value);
                  if (file) setFile(null);
                }}
                placeholder={"From: Name <name@company.com>\nSubject: What the email is about\n\nPaste the whole email here. Include the From and Subject lines if you have them."}
              />
            </>
          ) : file ? (
            <>
              <div className="filechip">
                <Icon name="mail" />
                <div>
                  <b>{file.name}</b>
                  <span>
                    {kb(file.size)} · {file.note}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    setFile(null);
                    setRaw("");
                  }}
                >
                  Remove
                </button>
              </div>
              <pre className="peek">
                {raw.slice(0, 900)}
                {raw.length > 900 ? "\n…" : ""}
              </pre>
            </>
          ) : (
            <button
              type="button"
              className={`drop${over ? " over" : ""}`}
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={() => setOver(false)}
            >
              <Icon name="upload" size={30} />
              <b>Drop an email file here</b>
              <span>or click to choose one · .eml, .msg, .pdf or .txt</span>
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            className="sr"
            accept=".eml,.msg,.pdf,.txt,.htm,.html,message/rfc822,application/pdf,text/plain,text/html"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void loadFile(f);
            }}
          />
          {err && (
            <div className="form-err" role="alert" style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 200 }}>{err}</span>
              {raw.trim() && errKind === "read" && (
                <>
                  <button type="button" className="btn btn-sm" onClick={read}>
                    Try again
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={manual}>
                    Fill it in yourself
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <div className="add-f">
          <span className="hint" aria-live="polite">
            {opening ? "Opening the file…" : words ? `${words.toLocaleString()} words ready to read` : "Tip: you can drop an email file anywhere on this page. Full threads are fine."}
          </span>
          <button type="button" className="btn btn-primary" onClick={read} disabled={!raw.trim() || opening}>
            <Icon name="scan" size={15} />
            Read email
          </button>
        </div>
      </section>
    </div>
  );
}

