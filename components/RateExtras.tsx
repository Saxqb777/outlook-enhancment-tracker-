"use client";

import { useMemo, useState } from "react";
import { addRateDocs, removeRateDoc, sendRateFeedback, updateRateDoc } from "@/app/actions/rates";
import { Dialog, useAct } from "@/components/Approvals";
import { useUploader } from "@/components/Attach";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/work";
import { checkFile, RT_MAX_BYTES, RT_MAX_FILES, type Uploaded } from "@/lib/attach-rules";

const aed = (n: number) => `AED ${Math.round(n).toLocaleString("en-US")}`;
const monthName = (ym: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));
const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`)) : "");

// ------------------------------------------------------------------ the rate, month by month

export type BookLine = { key: string; date: string; supplier: string; allIn: number; freight: string; agreed: boolean };

/**
 * What the rate was in each month, and one month put beside another ("what was it in January, what is it now").
 * Uses the all-in rate for one container. Each month shows its lowest quote and the average of all quotes that month.
 */
export function MonthBook({ lines, type, usd, onMonth }: { lines: BookLine[]; type: string; usd: (aed: number) => string; onMonth: (ym: string) => void }) {
  const months = useMemo(() => {
    const m = new Map<string, BookLine[]>();
    for (const l of lines) m.set(l.date.slice(0, 7), [...(m.get(l.date.slice(0, 7)) ?? []), l]);
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ym, ls]) => {
        const low = [...ls].sort((a, b) => a.allIn - b.allIn)[0];
        return { ym, low, avg: ls.reduce((n, l) => n + l.allIn, 0) / ls.length, n: ls.length, agreed: ls.find((l) => l.agreed) ?? null };
      });
  }, [lines]);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  if (!months.length) return null;
  const first = months.find((m) => m.ym === a) ?? months[0];
  const second = months.find((m) => m.ym === b) ?? months[months.length - 1];
  const diff = second.low.allIn - first.low.allIn;
  const pct = first.low.allIn ? (diff / first.low.allIn) * 100 : 0;
  const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");
  return (
    <section className="panel rt-book" aria-label="Rate by month" data-tour="rt-book">
      <div className="panel-h">
        <h2>
          Rate by month{type ? ` · ${type}` : ""} <span className="count">{months.length}</span>
        </h2>
        <span className="small muted">All in, for one container. Lowest quote of each month.</span>
      </div>
      {months.length > 1 ? (
        <div className="rt-then">
          <label>
            <span>Then</span>
            <select className="inp" value={first.ym} onChange={(e) => setA(e.target.value)} aria-label="First month to compare">
              {months.map((m) => (
                <option key={m.ym} value={m.ym}>
                  {monthName(m.ym)}
                </option>
              ))}
            </select>
            <b>{aed(first.low.allIn)}</b>
            <span className="small muted">{first.low.supplier}</span>
          </label>
          <span className="rt-then-arrow" aria-hidden="true">→</span>
          <label>
            <span>Now</span>
            <select className="inp" value={second.ym} onChange={(e) => setB(e.target.value)} aria-label="Second month to compare">
              {months.map((m) => (
                <option key={m.ym} value={m.ym}>
                  {monthName(m.ym)}
                </option>
              ))}
            </select>
            <b>{aed(second.low.allIn)}</b>
            <span className="small muted">{second.low.supplier}</span>
          </label>
          <div className={`rt-then-diff ${diff > 0 ? "up" : diff < 0 ? "down" : ""}`} role="status">
            <b>
              {first.ym === second.ym ? "Same month" : diff === 0 ? "No change" : `${sign(diff)}${aed(Math.abs(diff))}`}
            </b>
            {first.ym !== second.ym && diff !== 0 && (
              <span>
                {sign(pct)}
                {Math.abs(pct).toFixed(1)}% · {diff > 0 ? "you pay more now" : "you pay less now"} ({usd(Math.abs(diff))})
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="rt-note">Only {monthName(months[0].ym)} is on record for this so far. As quotes from other months are added, they line up here to compare.</p>
      )}
      <div className="rt-table-wrap">
        <table className="rt-table">
          <thead>
            <tr>
              <th>Month</th>
              <th className="r">Lowest, all in (AED)</th>
              <th>Supplier</th>
              <th>Freight part</th>
              <th className="r">Average (AED)</th>
              <th className="r">Quotes</th>
              <th className="r">Against the month before</th>
            </tr>
          </thead>
          <tbody>
            {[...months].reverse().map((m) => {
              const prev = months[months.indexOf(m) - 1];
              const d = prev ? m.low.allIn - prev.low.allIn : null;
              return (
                <tr key={m.ym}>
                  <td>
                    <button type="button" className="rt-link" onClick={() => onMonth(m.ym)} title="Show only this month's quotes">
                      {monthName(m.ym)}
                    </button>
                    {m.agreed && <span className="rq-tag">Agreed</span>}
                  </td>
                  <td className="r" title={usd(m.low.allIn)}>
                    <b>{Math.round(m.low.allIn).toLocaleString("en-US")}</b>
                  </td>
                  <td>{m.low.supplier}</td>
                  <td>{m.low.freight}</td>
                  <td className="r">{Math.round(m.avg).toLocaleString("en-US")}</td>
                  <td className="r">{m.n}</td>
                  <td className={`r ${d == null ? "" : d > 0 ? "rt-up" : d < 0 ? "rt-down" : ""}`}>
                    {d == null ? <span className="muted">first on record</span> : d === 0 ? "no change" : `${sign(d)}${Math.abs(Math.round(d)).toLocaleString("en-US")} (${sign(d)}${Math.abs((d / (prev.low.allIn || 1)) * 100).toFixed(1)}%)`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ documents

export type DocV = { id: string; title: string; route: string; supplier: string; doc_date: string | null; notes: string; name: string; size: string; view: boolean; by: string | null; added: string };

export function DocsTab({ docs, manage }: { docs: DocV[]; manage: boolean }) {
  const upload = useUploader("rt");
  const { busy, act } = useAct();
  const [find, setFind] = useState("");
  const [prog, setProg] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [edit, setEdit] = useState<DocV | null>(null);
  const words = find.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = docs.filter((d) => {
    const text = `${d.title} ${d.route} ${d.supplier} ${d.notes} ${d.name} ${d.doc_date ?? ""} ${day(d.doc_date)}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
  const add = async (list: FileList | File[]) => {
    const files = Array.from(list).slice(0, RT_MAX_FILES);
    if (Array.from(list).length > RT_MAX_FILES) toast(`Up to ${RT_MAX_FILES} files at a time. The first ${RT_MAX_FILES} are being added.`);
    const done: Uploaded[] = [];
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      const bad = checkFile(files[i], RT_MAX_BYTES);
      if (bad) {
        toast(bad);
        failed++;
        continue;
      }
      setProg(`Uploading ${i + 1} of ${files.length}: ${files[i].name}`);
      try {
        done.push(await upload(files[i]));
      } catch {
        failed++;
      }
    }
    if (done.length) {
      setProg("Saving…");
      const r = await addRateDocs(done);
      toast(r.ok ? `${r.added} document${r.added === 1 ? "" : "s"} added.${failed ? ` ${failed} could not be added.` : ""}` : r.error);
    } else if (failed) toast("Those files could not be uploaded. Check your connection and try again.");
    setProg(null);
  };
  return (
    <section className="panel" aria-label="Documents">
      <div className="panel-h">
        <h2>
          Documents <span className="count">{docs.length}</span>
        </h2>
        <span className="small muted">Old rate sheets, contracts, emails: anything worth keeping. Up to 50 MB each.</span>
      </div>
      {manage && (
        <label
          className={`rt-drop compact${over ? " over" : ""}${prog ? " busy" : ""}`}
          onDragOver={(e) => {
            if (!Array.from(e.dataTransfer.types).includes("Files")) return;
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            if (!prog && e.dataTransfer.files.length) void add(e.dataTransfer.files);
          }}
        >
          {prog ? <span className="spinner" aria-hidden="true" /> : <Icon name="upload" size={18} />}
          <span>
            <b>{prog ?? "Drop files here, or press to choose"}</b>
            <span>{prog ? "Keep this page open until it finishes." : `PDF, Excel, Word, emails, photos. Up to ${RT_MAX_FILES} files at a time.`}</span>
          </span>
          <input type="file" multiple className="sr" disabled={!!prog} onChange={(e) => (e.target.files?.length && void add(e.target.files), (e.target.value = ""))} />
        </label>
      )}
      {docs.length > 0 && <input className="inp rt-find" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a document: name, route, supplier, date" aria-label="Find a document" />}
      <div className="list">
        {shown.map((d) => (
          <div key={d.id} className="aprow rt-doc">
            <span className="ap-main">
              <span className="ap-title">{d.title}</span>
              <span className="ap-sub">
                {d.doc_date && <span>{day(d.doc_date)}</span>}
                {d.route && <span>{d.route}</span>}
                {d.supplier && <span>{d.supplier}</span>}
                <span>
                  {d.name} · {d.size}
                </span>
              </span>
              {d.notes && <span className="rq-q-note">{d.notes}</span>}
            </span>
            <span className="ap-prog small">added {d.added}{d.by ? ` by ${d.by}` : ""}</span>
            <span className="ap-end">
              <a className="btn btn-sm" href={`/rates/doc/${d.id}${d.view ? "" : "?download"}`} target={d.view ? "_blank" : undefined} rel="noopener noreferrer">
                <Icon name={d.view ? "eye" : "download"} size={14} />
                {d.view ? "Open" : "Download"}
              </a>
              {manage && (
                <>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEdit(d)}>
                    Details
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => window.confirm(`Remove "${d.title}"? The file is deleted for good.`) && act(() => removeRateDoc(d.id), "Document removed.")}>
                    Remove
                  </button>
                </>
              )}
            </span>
          </div>
        ))}
        {!docs.length && <p className="empty">{manage ? "Nothing here yet. Drop your old rate sheets and contracts above to keep them in one place." : "No documents yet."}</p>}
        {docs.length > 0 && !shown.length && <p className="empty">No document matches that.</p>}
      </div>
      {edit && <DocDialog doc={edit} onClose={() => setEdit(null)} />}
    </section>
  );
}
function DocDialog({ doc, onClose }: { doc: DocV; onClose: () => void }) {
  const [v, setV] = useState({ title: doc.title, route: doc.route, supplier: doc.supplier, doc_date: doc.doc_date ?? "", notes: doc.notes });
  const { busy, act } = useAct();
  return (
    <Dialog title="Document details" onClose={onClose}>
      <p className="hint">These make the document easy to find later. The file itself ({doc.name}) is not changed.</p>
      <input className="inp" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="Name" maxLength={160} aria-label="Name" autoFocus />
      <input className="inp" value={v.route} onChange={(e) => setV({ ...v, route: e.target.value })} placeholder="Route, e.g. Al Ain to Auckland" maxLength={160} aria-label="Route" list="rt-places-s" />
      <div className="rt-two">
        <input className="inp" value={v.supplier} onChange={(e) => setV({ ...v, supplier: e.target.value })} placeholder="Supplier" maxLength={120} aria-label="Supplier" />
        <input className="inp inp-date" type="date" value={v.doc_date} onChange={(e) => setV({ ...v, doc_date: e.target.value })} aria-label="Date of the document" />
      </div>
      <textarea className="inp" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} placeholder="Notes" maxLength={1000} aria-label="Notes" />
      <div className="form-f">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={busy || !v.title.trim()} onClick={() => act(() => updateRateDoc(doc.id, v), "Saved.", onClose)}>
          Save
        </button>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ feedback

export type NoteV = { id: string; body: string; status: "new" | "working" | "done"; reply: string | null; by: string | null; at: string };
const NOTE_ST: Record<NoteV["status"], [string, string]> = { new: ["Sent", "rq-open"], working: ["Being fixed", "rq-open"], done: ["Fixed", "signed"] };

export function FeedbackBox({ notes, canWrite, page, onClose }: { notes: NoteV[]; canWrite: boolean; page: string; onClose: () => void }) {
  const [text, setText] = useState("");
  const { busy, act } = useAct();
  return (
    <Dialog title="Feedback on Rates" onClose={onClose} wide>
      {canWrite ? (
        <>
          <p className="hint">Something wrong, slow, confusing or missing? Write it here in your own words, the way you would say it. An example helps: which route, which quote, what you expected to see.</p>
          <textarea className="inp" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. On the Auckland enquiry the total should be 24,950 for the 20FT but it shows…" maxLength={3000} aria-label="Your feedback" autoFocus />
          <div className="form-f">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Close
            </button>
            <button type="button" className="btn btn-primary" disabled={busy || text.trim().length < 5} onClick={() => act(() => sendRateFeedback(text, page), "Thank you. Your note is saved.", () => setText(""))}>
              Send
            </button>
          </div>
        </>
      ) : (
        <p className="hint">Notes from the people who use the rate book, and what was done about each.</p>
      )}
      {notes.length > 0 && (
        <div className="rt-notes">
          <h3 className="rt-h">Notes so far</h3>
          {notes.map((n) => (
            <div key={n.id} className="rt-note-row">
              <p>
                <span className={`ap-st ${NOTE_ST[n.status][1]}`}>{NOTE_ST[n.status][0]}</span>
                <span className="small muted">
                  {n.by ?? "Someone"} · {n.at}
                </span>
              </p>
              <p className="rt-note-b">{n.body}</p>
              {n.reply && (
                <p className="rt-note-r">
                  <b>Reply:</b> {n.reply}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
