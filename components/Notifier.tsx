"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { caseRef } from "@/lib/status";

const AP_SAY: Record<string, string> = {
  ap_created: "asks you to sign",
  ap_new_version: "sent a corrected version to sign",
  ap_signed: "signed your request",
  ap_sent_back: "sent it back",
  ap_rejected: "rejected it",
  ap_reply: "replied",
  ap_cancelled: "cancelled the request",
  ap_reminded: "is waiting for your signature",
};
const isAp = (n: { kind: string }) => n.kind.startsWith("ap_");
const apRef = (id: string) => `AP-${id.padStart(4, "0")}`;
const head = (n: Note) => (isAp(n) ? `${n.who ?? "Someone"} ${AP_SAY[n.kind] ?? "updated an approval"}` : `${n.kind === "ai" ? "AI" : (n.who ?? "Someone")} · ${caseRef(n.case_id)}`);
const href = (n: Note) => (isAp(n) ? `/approvals/${n.case_id}` : `/cases/${n.case_id}?tab=chat`);

type Note = { id: string; case_id: string; subject: string; who: string | null; kind: string; body: string };

/** Pops up new chat messages on any page, counts them in the tab title, and can alert on the desktop. */
export default function Notifier() {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [canAsk, setCanAsk] = useState(false);
  const after = useRef<string | null>(null);
  const seen = useRef(new Set<string>());
  const unread = useRef(0);

  useEffect(() => {
    setCanAsk(typeof Notification !== "undefined" && Notification.permission === "default");
    let stop = false;
    // Keep "(2) " in front of the tab title, also after the page changes its own title.
    const applyTitle = () => {
      const base = document.title.replace(/^\(\d+\) /, "");
      const want = unread.current > 0 ? `(${unread.current}) ${base}` : base;
      if (document.title !== want) document.title = want;
    };
    const watch = new MutationObserver(applyTitle);
    watch.observe(document.head, { subtree: true, childList: true, characterData: true });
    const tick = async () => {
      try {
        const res = await fetch(`/api/notify${after.current ? `?after=${encodeURIComponent(after.current)}` : ""}`, { cache: "no-store" });
        if (!res.ok || stop) return;
        const j = (await res.json()) as { now: string; items: Note[]; unread: number };
        after.current = j.now;
        unread.current = j.unread;
        applyTitle();
        const open = (window as unknown as { __chatOpen?: string | null }).__chatOpen;
        const fresh = j.items.filter((n) => !seen.current.has(n.id) && !(!isAp(n) && open === n.case_id && document.visibilityState === "visible"));
        if (!fresh.length) return;
        fresh.forEach((n) => seen.current.add(n.id));
        setNotes((v) => [...v, ...fresh].slice(-3));
        router.refresh();
        fresh.forEach((n) => setTimeout(() => setNotes((v) => v.filter((x) => x.id !== n.id)), 12000));
        if (document.visibilityState !== "visible" && typeof Notification !== "undefined" && Notification.permission === "granted") {
          const n = fresh[fresh.length - 1];
          const d = new Notification(head(n), { body: isAp(n) ? `${apRef(n.case_id)} · ${n.subject}` : n.body, tag: `${isAp(n) ? "ap" : "case"}-${n.case_id}` });
          d.onclick = () => {
            window.focus();
            router.push(href(n));
            d.close();
          };
        }
      } catch {
        /* offline: try again next time */
      }
    };
    void tick();
    const t = setInterval(tick, 6000);
    return () => {
      stop = true;
      watch.disconnect();
      clearInterval(t);
    };
  }, [router]);

  if (!notes.length) return null;
  return (
    <div className="notes" role="status" aria-live="polite">
      {notes.map((n) => (
        <div className="note" key={n.id}>
          <span className="note-i">
            <Icon name={isAp(n) ? "sign" : n.kind === "ai" ? "spark" : "chat"} size={16} />
          </span>
          <div className="note-b">
            <b>{head(n)}</b>
            <span className="note-s">{isAp(n) ? `${apRef(n.case_id)} · ${n.subject}` : n.subject}</span>
            <span className="note-t">{n.body}</span>
            <span className="note-f">
              <Link className="btn btn-sm btn-primary" href={href(n)} onClick={() => setNotes((v) => v.filter((x) => x.id !== n.id))}>
                {isAp(n) ? (n.kind === "ap_created" || n.kind === "ap_new_version" || n.kind === "ap_reminded" ? "Open and sign" : "Open") : "Open chat"}
              </Link>
              {canAsk && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => void Notification.requestPermission().then(() => setCanAsk(false))}
                >
                  Alert me on my desktop too
                </button>
              )}
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
