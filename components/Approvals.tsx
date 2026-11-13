"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { cancelApproval, createApproval, declineApproval, newVersion, remindSigners, replyApproval, signApproval } from "@/app/actions/approvals";
import { AttachPicker, useAttach } from "@/components/Attach";
import { Avatar, Icon } from "@/components/Icon";
import { toast } from "@/components/work";
import { progress, STATE_LABEL, STATUS_LABEL, type State, type Status } from "@/lib/approval-labels";

type Result = { ok: true } | { ok: false; error: string };
// ------------------------------------------------------------------ signature pad

const W = 1200;
const H = 400;

/** Draw with a finger, pen or mouse. Gives back a PNG (data URL), or null while empty. */
export function SignaturePad({ onChange, saved }: { onChange: (png: string | null) => void; saved?: string | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [drawn, setDrawn] = useState(false);
  const [usingSaved, setUsingSaved] = useState(false);

  const at = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const pen = () => {
    const c = canvas.current!.getContext("2d")!;
    c.strokeStyle = "#101a3a";
    c.fillStyle = "#101a3a";
    c.lineCap = "round";
    c.lineJoin = "round";
    return c;
  };
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    canvas.current!.setPointerCapture(e.pointerId);
    const p = at(e);
    last.current = p;
    const c = pen();
    c.beginPath();
    c.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
    c.fill();
  };
  const move = (e: React.PointerEvent) => {
    if (!last.current) return;
    const p = at(e);
    const c = pen();
    // A little thicker when the pen moves slowly, like ink.
    const d = Math.hypot(p.x - last.current.x, p.y - last.current.y);
    c.lineWidth = Math.max(3.2, 7 - d / 9);
    c.beginPath();
    c.moveTo(last.current.x, last.current.y);
    c.lineTo(p.x, p.y);
    c.stroke();
    last.current = p;
  };
  const up = () => {
    if (!last.current) return;
    last.current = null;
    setDrawn(true);
    onChange(canvas.current!.toDataURL("image/png"));
  };
  const clear = () => {
    canvas.current?.getContext("2d")?.clearRect(0, 0, W, H);
    last.current = null;
    setDrawn(false);
    setUsingSaved(false);
    onChange(null);
  };

  return (
    <div className="sig">
      <div className={`sig-pad${drawn || usingSaved ? " on" : ""}`}>
        {usingSaved && saved ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={saved} alt="Your saved signature" />
        ) : (
          <canvas ref={canvas} width={W} height={H} aria-label="Draw your signature here" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
        )}
        {!drawn && !usingSaved && <span className="sig-hint">Sign here with your finger or mouse</span>}
        <i className="sig-line" />
      </div>
      <div className="sig-f">
        {saved && !usingSaved && !drawn && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setUsingSaved(true);
              onChange(saved);
            }}
          >
            <Icon name="sign" size={15} />
            Use my saved signature
          </button>
        )}
        <span className="sp" />
        <button type="button" className="btn btn-sm btn-ghost" onClick={clear} disabled={!drawn && !usingSaved}>
          <Icon name="undo" size={14} />
          Clear
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ dialogs

export function Dialog({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return createPortal(
    <div className="dialog-wrap" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog ap-dialog${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function useAct() {
  const router = useRouter();
  const [busy, start] = useTransition();
  const act = (p: () => Promise<Result>, done: string, after?: () => void) =>
    start(async () => {
      try {
        const r = await p();
        if (!r.ok) return toast(r.error);
        toast(done);
        after?.();
        router.refresh();
      } catch {
        toast("That didn't save. Check your connection and try again.");
      }
    });
  return { busy, act };
}

// ------------------------------------------------------------------ the signer's buttons

export function DecideBox({ id, name, stamp, saved, myState, version }: { id: string; name: string; stamp: string; saved: string | null; myState: State; version: number }) {
  const [mode, setMode] = useState<null | "sign" | "back" | "reject">(null);
  const [sig, setSig] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [save, setSave] = useState(!saved);
  const { busy, act } = useAct();
  const close = () => {
    setMode(null);
    setSig(null);
    setText("");
  };
  return (
    <div className="ap-decide">
      <p className="ap-decide-t">
        <b>{myState === "sent_back" ? "You sent this back." : "Your signature is needed."}</b>{" "}
        {myState === "sent_back" ? "Sign when you're happy with the answer or the corrected version." : version > 1 ? `This is version ${version}. Read it, then sign or say what's wrong.` : "Read it, then sign or say what's wrong."}
      </p>
      <div className="ap-decide-b">
        <button type="button" className="btn btn-primary" onClick={() => setMode("sign")}>
          <Icon name="sign" size={16} />
          Sign
        </button>
        <button type="button" className="btn" onClick={() => setMode("back")}>
          <Icon name="reply" size={15} />
          Send back
        </button>
        <button type="button" className="btn btn-ghost ap-no" onClick={() => setMode("reject")}>
          <Icon name="x" size={15} />
          Final reject
        </button>
      </div>

      {mode === "sign" && (
        <Dialog title="Sign this approval" onClose={close} wide>
          <SignaturePad onChange={setSig} saved={saved} />
          <p className="ap-stamp">
            <b>{name}</b> · {stamp}
          </p>
          <input className="inp" value={text} onChange={(e) => setText(e.target.value)} placeholder="Comment (optional)" maxLength={500} autoComplete="off" />
          <label className="ap-check">
            <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
            Save my signature for next time
          </label>
          <div className="form-f">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={!sig || busy} onClick={() => act(() => signApproval(id, sig!, text, save), "Signed.", close)}>
              {busy ? "Signing…" : "Sign and approve"}
            </button>
          </div>
        </Dialog>
      )}
      {(mode === "back" || mode === "reject") && (
        <Dialog title={mode === "back" ? "Send back for changes" : "Final reject"} onClose={close}>
          <p className="hint">
            {mode === "back"
              ? "The request stays open. The person asking can reply or send a corrected version, then you can sign."
              : "This closes the request for everyone. To try again, the person asking has to file a new request."}
          </p>
          <textarea className="inp" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === "back" ? "What needs to change?" : "Why is this rejected?"} maxLength={2000} autoFocus />
          <div className="form-f">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className={`btn ${mode === "back" ? "btn-primary" : "ap-danger"}`}
              disabled={!text.trim() || busy}
              onClick={() => act(() => declineApproval(id, text, mode === "reject"), mode === "back" ? "Sent back." : "Rejected. The request is closed.", close)}
            >
              {mode === "back" ? "Send back" : "Reject and close"}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ thread reply

export function ReplyBox({ id }: { id: string }) {
  const [text, setText] = useState("");
  const { busy, act } = useAct();
  const send = () => text.trim() && act(() => replyApproval(id, text), "Reply sent.", () => setText(""));
  return (
    <form
      className="ap-reply"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <textarea
        className="inp"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a reply…"
        maxLength={2000}
        aria-label="Reply"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
        }}
      />
      <button type="submit" className="btn btn-primary" disabled={!text.trim() || busy}>
        <Icon name="send" size={15} />
        Send
      </button>
    </form>
  );
}

// ------------------------------------------------------------------ the requester's tools

export function RequesterTools({ id, body, anySigned, waiting }: { id: string; body: string; anySigned: boolean; waiting: number }) {
  const [mode, setMode] = useState<null | "version" | "cancel">(null);
  const [text, setText] = useState(body);
  const [note, setNote] = useState("");
  const att = useAttach("apv");
  const { busy, act } = useAct();
  const close = () => {
    setMode(null);
    att.clear();
  };
  return (
    <div className="ap-tools">
      <button type="button" className="btn" onClick={() => (setText(body), setNote(""), setMode("version"))}>
        <Icon name="upload" size={15} />
        Send a corrected version
      </button>
      {waiting > 0 && (
        <button type="button" className="btn" disabled={busy} onClick={() => act(() => remindSigners(id), "Reminder sent.")}>
          <Icon name="clock" size={15} />
          Remind
        </button>
      )}
      <button type="button" className="btn btn-ghost" onClick={() => setMode("cancel")}>
        Cancel request
      </button>

      {mode === "version" && (
        <Dialog title="Send a corrected version" onClose={close} wide>
          <p className="hint">{anySigned ? "Everyone signs the new version, also the people who already signed. Their earlier signatures stay in the record." : "The signers are told there is a new version to read and sign."}</p>
          <textarea className="inp" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="The corrected text" maxLength={20000} aria-label="Text" />
          <AttachPicker att={att} />
          <span className="hint">No new file? The current documents stay.</span>
          <input className="inp" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed? (optional)" maxLength={500} autoComplete="off" />
          <div className="form-f">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || att.busy || (text.trim() === body.trim() && !att.uploaded.length)}
              onClick={() => act(() => newVersion(id, { body: text, files: att.uploaded, note }), "New version sent.", close)}
            >
              {att.busy ? "Uploading…" : "Send new version"}
            </button>
          </div>
        </Dialog>
      )}
      {mode === "cancel" && (
        <Dialog title="Cancel this request?" onClose={close}>
          <p className="hint">Nobody can sign it after this. It stays in your history as Cancelled.</p>
          <div className="form-f">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Keep it
            </button>
            <button type="button" className="btn ap-danger" disabled={busy} onClick={() => act(() => cancelApproval(id), "Request cancelled.", close)}>
              Cancel request
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export function PrintButton() {
  return (
    <button type="button" className="btn no-print" onClick={() => window.print()}>
      <Icon name="download" size={15} />
      <span className="m-hide">Print or save as PDF</span>
      <span className="m-only-i">PDF</span>
    </button>
  );
}

// ------------------------------------------------------------------ new request

export function ApprovalNew({ people, today }: { people: { id: string; name: string; role: string }[]; today: string }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [who, setWho] = useState<string[]>([]);
  const [needed, setNeeded] = useState("");
  const [error, setError] = useState<string | null>(null);
  const att = useAttach("apv");
  const [busy, start] = useTransition();
  const ready = title.trim() && (body.trim() || att.uploaded.length) && who.length && !att.busy;
  const submit = () =>
    start(async () => {
      setError(null);
      const r = await createApproval({ title, body, signerIds: who, neededBy: needed, files: att.uploaded });
      if (r && !r.ok) setError(r.error);
    });
  return (
    <form
      className="panel ap-new"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) submit();
      }}
    >
      <div className="field">
        <label htmlFor="ap-title">What is it?</label>
        <input id="ap-title" className="inp inp-lg" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Demurrage waiver for MSKU 123456" maxLength={200} autoComplete="off" autoFocus />
      </div>
      <div className="field">
        <label htmlFor="ap-body">Details</label>
        <textarea id="ap-body" className="inp" rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write what needs approving, or attach the document below. You can do both." maxLength={20000} />
      </div>
      <div className="field">
        <label>Document</label>
        <AttachPicker att={att} />
      </div>
      <div className="field">
        <label>Who needs to sign?</label>
        <div className="chips" role="group" aria-label="Who needs to sign">
          {people.map((p) => {
            const on = who.includes(p.id);
            return (
              <button key={p.id} type="button" className="chip" aria-pressed={on} onClick={() => setWho(on ? who.filter((x) => x !== p.id) : [...who, p.id])}>
                <Avatar name={p.name} lead={p.role === "lead"} size="xs" />
                {p.name}
                {p.role === "lead" && <span className="chip-r">Lead</span>}
              </button>
            );
          })}
          {!people.length && <span className="hint">Nobody else has joined yet.</span>}
        </div>
        <span className="hint">Pick one or more. It is Signed when all of them have signed.</span>
      </div>
      <div className="field ap-date">
        <label htmlFor="ap-need">Needed by (optional)</label>
        <input id="ap-need" type="date" className="inp inp-date" min={today} value={needed} onChange={(e) => setNeeded(e.target.value)} />
      </div>
      {error && <p className="form-err">{error}</p>}
      <div className="form-f">
        <Link className="btn btn-ghost" href="/approvals">
          Cancel
        </Link>
        <button type="submit" className="btn btn-primary" disabled={!ready || busy}>
          {busy ? "Sending…" : att.busy ? "Uploading…" : "Ask for approval"}
        </button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ list

export type ApItem = {
  id: string;
  ref: string;
  title: string;
  status: Status;
  version: number;
  needed: string | null;
  late: boolean;
  when: string;
  requester_id: string;
  requester: string;
  signers: { id: string; name: string; state: State }[];
  files: number;
  mine: State | null;
};
type Tab = "sign" | "asked" | "open" | "history";

export function ApprovalList({ items, meId, seeAll, initial }: { items: ApItem[]; meId: string; seeAll: boolean; initial?: Tab }) {
  const tests: Record<Tab, (a: ApItem) => boolean> = {
    sign: (a) => a.status === "open" && (a.mine === "pending" || a.mine === "sent_back"),
    asked: (a) => a.status === "open" && a.requester_id === meId,
    open: (a) => a.status === "open",
    history: (a) => a.status !== "open",
  };
  const tabs: [Tab, string][] = [["sign", "For me to sign"], ["asked", "I asked for"], ...(seeAll ? ([["open", "All open"]] as [Tab, string][]) : []), ["history", seeAll ? "History" : "My history"]];
  const first = initial ?? (items.some(tests.sign) ? "sign" : items.some(tests.asked) ? "asked" : seeAll && items.some(tests.open) ? "open" : "sign");
  const [tab, setTab] = useState<Tab>(first);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | Status>("all");
  const needle = q.trim().toLowerCase();
  let list = needle ? items : items.filter(tests[tab]);
  if (needle) list = list.filter((a) => `${a.ref} ${a.title} ${a.requester} ${a.signers.map((s) => s.name).join(" ")}`.toLowerCase().includes(needle));
  if (!needle && tab === "history" && kind !== "all") list = list.filter((a) => a.status === kind);
  return (
    <>
      <div className="filters">
        <div className="seg" role="group" aria-label="Show">
          {tabs.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={!needle && tab === k} onClick={() => (setTab(k), setQ(""))}>
              {l}
              <span className="n">{items.filter(tests[k]).length}</span>
            </button>
          ))}
        </div>
        {!needle && tab === "history" && (
          <div className="chips" role="group" aria-label="Result">
            {(["all", "signed", "rejected", "cancelled"] as const).map((k) => (
              <button key={k} type="button" className="chip all" aria-pressed={kind === k} onClick={() => setKind(k)}>
                {k === "all" ? "All" : STATUS_LABEL[k]}
              </button>
            ))}
          </div>
        )}
        <label className="find">
          <Icon name="search" size={15} />
          <span className="sr">Search approvals</span>
          <input type="search" placeholder="Search by number, title or person" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        </label>
      </div>
      <section className="panel" aria-label="Approvals">
        <div className="list">
          {list.map((a) => (
            <Link key={a.id} className="aprow" href={`/approvals/${a.id}`}>
              <span className="cid">{a.ref}</span>
              <span className="ap-main">
                <span className="ap-title">
                  {a.title}
                  {a.version > 1 && <span className="ap-ver">v{a.version}</span>}
                </span>
                <span className="ap-sub">
                  <span className="cid ap-ref-m">{a.ref}</span>
                  <span>{a.requester_id === meId ? "You asked" : `${a.requester} asked`}</span>
                  <span>{a.when}</span>
                  {a.files > 0 && (
                    <span className="ap-clip">
                      <Icon name="clip" size={12} />
                      {a.files}
                    </span>
                  )}
                </span>
              </span>
              <span className="ap-who" title={a.signers.map((s) => `${s.name}: ${STATE_LABEL[s.state]}`).join("\n")}>
                {a.signers.slice(0, 4).map((s) => (
                  <span key={s.id} className={`ap-dot ${s.state}`}>
                    <Avatar name={s.name} size="xs" />
                  </span>
                ))}
                {a.signers.length > 4 && <span className="small muted">+{a.signers.length - 4}</span>}
              </span>
              <span className="ap-prog small">{a.status === "open" ? progress(a.signers) : ""}</span>
              <span className="ap-end">
                {a.status === "open" && a.needed && <span className={`due${a.late ? " late" : ""}`}>By {a.needed}</span>}
                <span className={`ap-st ${a.status === "open" && tests.sign(a) ? "todo" : a.status}`}>{a.status === "open" && tests.sign(a) ? (a.mine === "sent_back" ? "You sent back" : "Sign") : STATUS_LABEL[a.status]}</span>
              </span>
            </Link>
          ))}
          {!list.length && (
            <p className="empty">
              {needle ? "Nothing matches that search." : tab === "sign" ? "Nothing is waiting for your signature." : tab === "asked" ? "You have no open requests. Press New request to ask for an approval." : tab === "open" ? "No open requests." : "Finished approvals will be listed here."}
            </p>
          )}
        </div>
      </section>
    </>
  );
}
