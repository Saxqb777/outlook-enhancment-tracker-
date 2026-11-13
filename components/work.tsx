"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { reopenPoint, setCaseDeadline, setPointDue, setPointStatus, type ActionResult } from "@/app/actions/work";
import { Icon } from "@/components/Icon";
import { AttachPicker, useAttach } from "@/components/Attach";
import type { Uploaded } from "@/lib/attach-rules";
import { cap, DueTag, Glyph, Pill } from "@/components/ui";
import type { Role } from "@/lib/auth";
import { STATUSES, STATUS_LABEL, type Status } from "@/lib/status";
import { addDaysISO, dueInfo, fmtDay, nextWeekday } from "@/lib/time";

// ------------------------------------------------------------------ view only (Admin)

const ViewOnlyCtx = createContext(false);
export function ViewOnlyProvider({ value, children }: { value: boolean; children: React.ReactNode }) {
  return <ViewOnlyCtx.Provider value={value}>{children}</ViewOnlyCtx.Provider>;
}
export const useViewOnly = () => useContext(ViewOnlyCtx);

// ------------------------------------------------------------------ polling

/**
 * Calls `tick` now and then every `visibleMs` while the tab is on screen. In a background tab it slows to
 * `hiddenMs` (or stops when that is null), and it catches up the moment the tab is looked at again.
 */
export function poll(tick: () => void | Promise<void>, visibleMs: number, hiddenMs: number | null): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const loop = async () => {
    if (stopped) return;
    const hidden = document.visibilityState !== "visible";
    if (!hidden || hiddenMs !== null) await tick();
    if (!stopped) timer = setTimeout(loop, hidden ? (hiddenMs ?? 60000) : visibleMs);
  };
  const onShow = () => {
    if (document.visibilityState !== "visible") return;
    clearTimeout(timer);
    void loop();
  };
  void loop();
  document.addEventListener("visibilitychange", onShow);
  return () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onShow);
  };
}

// ------------------------------------------------------------------ toasts

export function toast(message: string) {
  window.dispatchEvent(new CustomEvent("ae-toast", { detail: message }));
}

export function Toasts() {
  const [items, setItems] = useState<{ id: number; text: string }[]>([]);
  useEffect(() => {
    let n = 0;
    const on = (e: Event) => {
      const id = ++n;
      setItems((v) => [...v.slice(-2), { id, text: String((e as CustomEvent).detail) }]);
      setTimeout(() => setItems((v) => v.filter((t) => t.id !== id)), 4200);
    };
    window.addEventListener("ae-toast", on);
    return () => window.removeEventListener("ae-toast", on);
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div className="toast" key={t.id}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Runs a server action, shows its error as a toast, and returns whether it worked. */
export async function run(p: Promise<ActionResult>): Promise<boolean> {
  try {
    const r = await p;
    if (!r.ok) toast(r.error);
    return r.ok;
  } catch {
    toast("That didn't save. Check your connection and try again.");
    return false;
  }
}

// ------------------------------------------------------------------ floating menu

export function Pop({ anchor, onClose, children, label }: { anchor: HTMLElement | null; onClose: () => void; children: React.ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });

  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current;
      if (!anchor || !el || !document.contains(anchor)) return closeRef.current();
      const a = anchor.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      let left = Math.min(Math.max(12, a.left), window.innerWidth - w - 12);
      let top = a.bottom + 6;
      if (top + h > window.innerHeight - 12 && a.top - h - 6 > 12) top = a.top - h - 6;
      left = Math.max(12, left);
      setPos({ top, left });
    };
    place();
    const ro = typeof ResizeObserver !== "undefined" && ref.current ? new ResizeObserver(place) : null;
    if (ro && ref.current) ro.observe(ref.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);

  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      if (t instanceof Element && t.closest(".pop") && t.closest(".pop") !== ref.current) return;
      closeRef.current();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeRef.current();
        anchor?.focus();
      }
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    const first = ref.current?.querySelector<HTMLElement>("button:not([disabled]), input");
    first?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [anchor]);

  return createPortal(
    <div ref={ref} className="pop" role="menu" aria-label={label} style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}>
      {children}
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------------ status

export function StatusControl({
  pointId,
  status,
  role,
  leadName,
  variant = "pill",
}: {
  pointId: string;
  status: Status;
  role: Role;
  leadName: string;
  variant?: "pill" | "icon";
}) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<Status | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const att = useAttach(pointId);
  const btn = useRef<HTMLButtonElement>(null);
  const [pending, start] = useTransition();
  const [shown, setShown] = useOptimistic(status);
  const locked = role === "member" && status === "approved";
  const viewOnly = useViewOnly();
  const close = () => {
    setOpen(false);
    setAsking(null);
  };

  const apply = (s: Status, why?: string) => {
    close();
    btn.current?.focus();
    const files = att.uploaded;
    const text = note.trim();
    if (s === status && s !== "wait" && !text && !files.length) return;
    start(async () => {
      setShown(s);
      const ok = await run(setPointStatus(pointId, s, why, { note: text, files }));
      if (!ok) return;
      setReason("");
      setNote("");
      att.clear();
      if (s === "approved") toast("Approved.");
      else if (files.length) toast(`${STATUS_LABEL[s]}, with ${files.length} file${files.length === 1 ? "" : "s"} attached.`);
    });
  };
  // Done and Waiting ask for a little more: a reason for Waiting, and an optional note and files for both.
  const choose = (s: Status) => (s === "wait" || s === "done" ? setAsking(s) : apply(s));

  if (viewOnly) return variant === "icon" ? null : <Pill s={status} />;

  const trigger =
    variant === "icon" ? (
      <button ref={btn} type="button" className="icon-btn" aria-haspopup="menu" aria-expanded={open} aria-label="Change status" onClick={() => setOpen((v) => !v)}>
        <Icon name="more" size={15} />
      </button>
    ) : (
      <button
        ref={btn}
        type="button"
        className={`pill st-${shown}${pending ? " is-busy" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-disabled={locked || undefined}
        title={locked ? `Approved. Ask ${leadName} to reopen it if something changed.` : "Change status"}
        onClick={() => (locked ? toast(`This point is approved. Ask ${leadName} to reopen it if something changed.`) : setOpen((v) => !v))}
      >
        <span className="sr">Status: </span>
        <Glyph s={shown} />
        <span>{STATUS_LABEL[shown]}</span>
        {!locked && <Icon name="chevD" size={13} className="chev" />}
      </button>
    );

  const wait = asking === "wait";
  return (
    <>
      {trigger}
      {open && (
        <Pop anchor={btn.current} onClose={close} label="Set status">
          {asking ? (
            <form
              className="menu-form wide"
              onSubmit={(e) => {
                e.preventDefault();
                if (wait && !reason.trim()) return;
                if (att.busy) return;
                apply(asking, wait ? reason.trim() : undefined);
              }}
            >
              <div className="menu-form-h">
                <Glyph s={asking} />
                <b>{wait ? "Set to Waiting" : "Mark as done"}</b>
              </div>
              {wait && (
                <>
                  <label htmlFor={`why-${pointId}`}>What is it waiting on?</label>
                  <input
                    id={`why-${pointId}`}
                    className="inp"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Customs to release the permit"
                    maxLength={200}
                    autoComplete="off"
                  />
                </>
              )}
              <label htmlFor={`note-${pointId}`}>{wait ? "Note (optional)" : "What was done? (optional)"}</label>
              <textarea
                id={`note-${pointId}`}
                className="inp"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={wait ? "Anything the team should know" : "e.g. Permit sent to the broker, copy attached"}
                maxLength={2000}
              />
              <AttachPicker att={att} />
              <div className="form-f">
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAsking(null)}>
                  Back
                </button>
                <button type="submit" className="btn btn-sm btn-primary" disabled={(wait && !reason.trim()) || att.busy}>
                  {att.busy ? "Uploading…" : wait ? "Set to Waiting" : "Mark done"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="menu-h">Set status</div>
              {STATUSES.map((s) => {
                const dis = role === "member" && s === "approved";
                return (
                  <button
                    key={s}
                    type="button"
                    className={`mi${shown === s ? " cur" : ""}`}
                    role="menuitemradio"
                    aria-checked={shown === s}
                    disabled={dis}
                    onClick={() => choose(s)}
                  >
                    <Glyph s={s} />
                    <span>{STATUS_LABEL[s]}</span>
                    {dis ? (
                      <span className="hint">{cap(leadName)} approves</span>
                    ) : s === "done" || s === "wait" ? (
                      <span className="hint">
                        <Icon name="clip" size={13} />
                      </span>
                    ) : shown === s ? (
                      <Icon name="check" size={15} />
                    ) : null}
                  </button>
                );
              })}
            </>
          )}
        </Pop>
      )}
    </>
  );
}

// ------------------------------------------------------------------ deadlines

export function DueControl({
  due,
  status,
  today,
  pointId,
  caseId,
  label = "Change deadline",
}: {
  due: string | null;
  status: string;
  today: string;
  pointId?: string;
  caseId?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const viewOnly = useViewOnly();
  const btn = useRef<HTMLButtonElement>(null);
  const [pending, start] = useTransition();
  const [shown, setShown] = useOptimistic(due);
  const info = dueInfo(shown, status, today);
  const close = () => setOpen(false);

  const pick = (d: string | null) => {
    close();
    btn.current?.focus();
    if (d === due) return;
    start(async () => {
      setShown(d);
      await run(caseId ? setCaseDeadline(caseId, d) : setPointDue(pointId!, d));
    });
  };

  if (viewOnly) return <DueTag due={due} status={status} today={today} />;

  const opts: [string, string][] = [
    ["Today", today],
    ["Tomorrow", addDaysISO(today, 1)],
    ["This Friday", nextWeekday(today, 5, true)],
    ["Next Monday", nextWeekday(today, 1)],
  ];

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`due ${info.cls}${pending ? " is-busy" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={info.title ?? label}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sr">Deadline: </span>
        <Icon name={info.cls === "late" ? "flag" : "cal"} size={14} />
        <span>{info.text}</span>
      </button>
      {open && (
        <Pop anchor={btn.current} onClose={close} label="Deadline">
          <div className="menu-h">Deadline</div>
          {opts.map(([l, d]) => (
            <button key={l} type="button" className={`mi${shown === d ? " cur" : ""}`} onClick={() => pick(d)}>
              <span>{l}</span>
              <span className="hint">{fmtDay(d)}</span>
            </button>
          ))}
          <div className="menu-sep" />
          <div className="menu-date">
            <label htmlFor={`dp-${pointId ?? caseId}`}>Pick a date</label>
            <input
              id={`dp-${pointId ?? caseId}`}
              type="date"
              className="inp"
              defaultValue={shown ?? ""}
              onChange={(e) => {
                if (e.target.value) pick(e.target.value);
              }}
            />
          </div>
          {shown && (
            <button type="button" className="mi danger" onClick={() => pick(null)}>
              Remove deadline
            </button>
          )}
        </Pop>
      )}
    </>
  );
}

// ------------------------------------------------------------------ waiting reason (board drops)

export function StatusDialog({
  pointId,
  to,
  onCancel,
  onSave,
}: {
  pointId: string;
  to: "wait" | "done";
  onCancel: () => void;
  onSave: (why: string | undefined, extra: { note: string; files: Uploaded[] }) => void;
}) {
  const [why, setWhy] = useState("");
  const [note, setNote] = useState("");
  const att = useAttach(pointId);
  const wait = to === "wait";
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onCancel]);
  return createPortal(
    <div className="dialog-wrap" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="why-h"
        onSubmit={(e) => {
          e.preventDefault();
          if ((wait && !why.trim()) || att.busy) return;
          onSave(wait ? why.trim() : undefined, { note: note.trim(), files: att.uploaded });
        }}
      >
        <h2 id="why-h">{wait ? "What is it waiting on?" : "Mark as done"}</h2>
        {wait && (
          <input className="inp" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. Customs to release the permit" maxLength={200} autoFocus autoComplete="off" />
        )}
        <textarea className="inp" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={wait ? "Note (optional)" : "What was done? (optional)"} maxLength={2000} autoFocus={!wait} />
        <AttachPicker att={att} />
        <div className="form-f">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={(wait && !why.trim()) || att.busy}>
            {att.busy ? "Uploading…" : wait ? "Set to Waiting" : "Mark done"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------------ home helpers

export function ReviewButtons({ pointId }: { pointId: string }) {
  const [pending, start] = useTransition();
  if (useViewOnly()) return null;
  return (
    <span className={`row-act${pending ? " is-busy" : ""}`}>
      <button type="button" className="btn btn-sm" onClick={() => start(async () => void (await run(reopenPoint(pointId))))}>
        Reopen
      </button>
      <button
        type="button"
        className="btn btn-sm btn-primary"
        onClick={() =>
          start(async () => {
            if (await run(setPointStatus(pointId, "approved"))) toast("Approved.");
          })
        }
      >
        <Icon name="check" size={14} />
        Approve
      </button>
    </span>
  );
}

/** On phones, shows the first three rows and a "Show all" button. */
export function Clip({ count, kind = "rows", children }: { count: number; kind?: "rows" | "acts"; children: React.ReactNode }) {
  const [all, setAll] = useState(false);
  const Tag = kind === "acts" ? "ol" : "div";
  return (
    <>
      <Tag className={`${kind} clip${all ? " all" : ""}`}>{children}</Tag>
      {count > 3 && !all && (
        <button type="button" className="row-more" onClick={() => setAll(true)}>
          Show all {count}
        </button>
      )}
    </>
  );
}
