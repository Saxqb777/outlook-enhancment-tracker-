"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { confirmJob, declineRequest, sendVendorMessage, submitQuote } from "@/app/actions/portal";
import { Dialog, useAct } from "@/components/Approvals";
import { AttachPicker, useAttach } from "@/components/Attach";
import { Icon } from "@/components/Icon";
import RfqChat from "@/components/RfqChat";
import { poll } from "@/components/work";
import { CURRENCIES, money } from "@/lib/vendor-labels";

export type MyQuote = { state: "invited" | "quoted" | "declined"; price: string | null; currency: string | null; validUntil: string; readyOn: string; note: string; declineReason: string | null };

/** The vendor's answer to one request: give a price, change it, say they can't, or confirm a job they won. */
export function PortalReply({ id, result, quote, today, viewOnly = false, sandbox = false }: { id: string; result: string; quote: MyQuote; today: string; viewOnly?: boolean; sandbox?: boolean }) {
  const [mode, setMode] = useState<null | "quote" | "decline">(null);
  const [price, setPrice] = useState(quote.price ? String(Number(quote.price)) : "");
  const [currency, setCurrency] = useState(quote.currency ?? "AED");
  const [validUntil, setValidUntil] = useState(quote.validUntil);
  const [readyOn, setReadyOn] = useState(quote.readyOn);
  const [note, setNote] = useState(quote.note);
  const [why, setWhy] = useState("");
  const att = useAttach("vq");
  const { busy, act } = useAct();
  const close = () => (setMode(null), att.clear());

  if (result === "won")
    return (
      <div className="ap-decide rq-banner ok">
        <p className="ap-decide-t">
          <b>Your quote was chosen</b> at {money(quote.price, quote.currency)}. Please confirm you can do the job.
        </p>
        <div className="ap-decide-b">
          <button type="button" className="btn btn-primary" disabled={busy || viewOnly} title={viewOnly ? "View only" : undefined} onClick={() => act(() => confirmJob(id), "Job confirmed.")}>
            <Icon name="check" size={16} />
            Confirm the job
          </button>
        </div>
      </div>
    );
  if (result !== "open")
    return (
      <div className={`ap-decide rq-banner${result === "confirmed" || result === "done" ? " ok" : " off"}`}>
        <p className="ap-decide-t">
          <b>{result === "confirmed" ? "You confirmed this job." : result === "done" ? "This job is done. Thank you." : result === "lost" ? "Another quote was chosen this time." : "This request was cancelled."}</b>
          {quote.state === "quoted" && <> Your quote: {money(quote.price, quote.currency)}.</>}
        </p>
      </div>
    );
  return (
    <div className="ap-decide rq-banner">
      <p className="ap-decide-t">
        {quote.state === "quoted" ? (
          <>
            <b>Your quote: {money(quote.price, quote.currency)}.</b> You can change it while the request is open.
          </>
        ) : quote.state === "declined" ? (
          <>
            <b>You said you can&apos;t do this one.</b> You can still send a price if that changes.
          </>
        ) : (
          <>
            <b>Can you do this?</b> Send your price, or say you can&apos;t.
          </>
        )}
      </p>
      <div className="ap-decide-b">
        <button type="button" className="btn btn-primary" disabled={viewOnly} title={viewOnly ? "View only" : undefined} onClick={() => setMode("quote")}>
          <Icon name="check" size={16} />
          {quote.state === "quoted" ? "Change my quote" : "Can do, give price"}
        </button>
        {quote.state !== "declined" && (
          <button type="button" className="btn btn-ghost ap-no" disabled={viewOnly} onClick={() => setMode("decline")}>
            <Icon name="x" size={15} />
            Can&apos;t do
          </button>
        )}
      </div>
      {mode === "quote" && (
        <Dialog title={quote.state === "quoted" ? "Change your quote" : "Your quote"} onClose={close} wide>
          <div className="fields-row">
            <div className="field">
              <label htmlFor="pq-price">Total price</label>
              <input id="pq-price" className="inp inp-lg" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 2400" autoFocus autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="pq-cur">Currency</label>
              <select id="pq-cur" className="inp" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="fields-row">
            <div className="field">
              <label htmlFor="pq-ready">When can you do it?</label>
              <input id="pq-ready" type="date" className="inp inp-date" min={today} value={readyOn} onChange={(e) => setReadyOn(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="pq-valid">Price is valid until</label>
              <input id="pq-valid" type="date" className="inp inp-date" min={today} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="pq-note">Notes (what&apos;s included, conditions)</label>
            <textarea id="pq-note" className="inp" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
          </div>
          {!sandbox && <AttachPicker att={att} />}
          <div className="form-f">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!price.trim() || busy || att.busy}
              onClick={() => act(() => submitQuote(id, { price, currency, validUntil, readyOn, note, files: att.uploaded }), "Quote sent.", close)}
            >
              {att.busy ? "Uploading…" : "Send quote"}
            </button>
          </div>
        </Dialog>
      )}
      {mode === "decline" && (
        <Dialog title="Can't do this one" onClose={close}>
          <textarea className="inp" rows={3} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Short reason, e.g. no trucks free that day" maxLength={500} autoFocus />
          <div className="form-f">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={!why.trim() || busy} onClick={() => act(() => declineRequest(id, why), "Sent.", close)}>
              Send
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export function PortalChat({ id, canWrite }: { id: string; canWrite: boolean }) {
  const router = useRouter();
  return (
    <RfqChat
      url={`/api/portal/rfq/${id}/chat`}
      side="vendor"
      canWrite={canWrite}
      placeholder="Message the team…"
      send={async (body) => {
        const r = await sendVendorMessage(id, body);
        if (r.ok) router.refresh();
        return r;
      }}
    />
  );
}

type Note = { id: string; rfq_id: string; title: string; who: string | null; kind: string; body: string };

/** Pop-ups in the vendor portal for new requests and messages, plus the unread count in the tab title. */
export function PortalNotifier() {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const after = useRef<string | null>(null);
  const seen = useRef(new Set<string>());
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/portal/notify${after.current ? `?after=${encodeURIComponent(after.current)}` : ""}`, { cache: "no-store" });
        if (!res.ok || stop) return;
        const j = (await res.json()) as { now: string; items: Note[]; unread: number };
        after.current = j.now;
        const base = document.title.replace(/^\(\d+\) /, "");
        document.title = j.unread > 0 ? `(${j.unread}) ${base}` : base;
        const here = location.pathname.match(/^\/portal\/r\/(\d+)/)?.[1];
        const fresh = j.items.filter((n) => !seen.current.has(n.id) && n.rfq_id !== here);
        j.items.forEach((n) => seen.current.add(n.id));
        if (j.items.length) router.refresh();
        if (!fresh.length) return;
        setNotes((v) => [...v, ...fresh].slice(-3));
        fresh.forEach((n) => setTimeout(() => setNotes((v) => v.filter((x) => x.id !== n.id)), 12000));
      } catch {
        /* offline: try again next time */
      }
    };
    const stopPoll = poll(tick, 8000, 45000);
    return () => {
      stop = true;
      stopPoll();
    };
  }, [router]);
  if (!notes.length) return null;
  return (
    <div className="notes" role="status" aria-live="polite">
      {notes.map((n) => (
        <div className="note" key={n.id}>
          <span className="note-i">
            <Icon name={n.kind === "text" ? "chat" : "truck"} size={16} />
          </span>
          <div className="note-b">
            <b>{n.kind === "text" ? `${n.who ?? "The team"} wrote` : "Shipping Tickets"}</b>
            <span className="note-s">{n.title}</span>
            <span className="note-t">{n.body}</span>
            <span className="note-f">
              <Link className="btn btn-sm btn-primary" href={`/portal/r/${n.rfq_id}`} onClick={() => setNotes((v) => v.filter((x) => x.id !== n.id))}>
                Open
              </Link>
            </span>
          </div>
          <button type="button" className="icon-btn sm" aria-label="Dismiss" onClick={() => setNotes((v) => v.filter((x) => x.id !== n.id))}>
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
