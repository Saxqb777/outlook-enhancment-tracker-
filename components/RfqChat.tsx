"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { poll, toast } from "@/components/work";

type Msg = { id: string; kind: "text" | "system" | "internal"; body: string; at: string; who: string; side: "team" | "vendor" };
type Result = { ok: true } | { ok: false; error: string };

const when = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

/** The chat on one request with one vendor. Used by the team (side "team") and in the vendor portal (side "vendor"). */
export default function RfqChat({ url, send, side, canWrite, draft, onDraftUsed, placeholder }: { url: string; send: (body: string) => Promise<Result>; side: "team" | "vendor"; canWrite: boolean; draft?: string; onDraftUsed?: () => void; placeholder?: string }) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const count = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { messages: Msg[] };
      setMsgs(j.messages);
    } catch {
      /* offline: try again next time */
    }
  }, [url]);

  useEffect(() => {
    setMsgs(null);
    count.current = 0;
    // The chat only refreshes while someone is looking at it.
    return poll(load, 5000, null);
  }, [load]);
  useEffect(() => {
    if (msgs && msgs.length !== count.current) {
      count.current = msgs.length;
      box.current?.scrollTo({ top: box.current.scrollHeight });
    }
  }, [msgs]);
  useEffect(() => {
    if (draft) {
      setText(draft);
      onDraftUsed?.();
    }
  }, [draft, onDraftUsed]);

  const submit = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const r = await send(body);
      if (!r.ok) toast(r.error);
      else {
        setText("");
        await load();
      }
    } catch {
      toast("That didn't send. Check your connection and try again.");
    }
    setBusy(false);
  };

  return (
    <div className="rq-chat">
      <div className="rq-chat-b" ref={box} aria-live="polite">
        {!msgs && <p className="empty sm">Loading…</p>}
        {msgs && !msgs.length && <p className="empty sm">No messages yet.</p>}
        {msgs?.map((m) =>
          m.kind === "text" ? (
            <div key={m.id} className={`rq-msg${m.side === side ? " me" : ""}`}>
              <span className="rq-msg-h">
                {m.who} · {when(m.at)}
              </span>
              <p>{m.body}</p>
            </div>
          ) : (
            <div key={m.id} className={`rq-sys${m.kind === "internal" ? " internal" : ""}`}>
              {m.kind === "internal" && <Icon name="lock" size={12} />}
              <span>{m.body}</span>
              <time>{when(m.at)}</time>
            </div>
          ),
        )}
      </div>
      {canWrite && (
        <form
          className="rq-chat-in"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <textarea
            className="inp"
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder ?? "Write a message…"}
            maxLength={2000}
            aria-label="Message"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <button type="submit" className="btn btn-primary" disabled={!text.trim() || busy} aria-label="Send">
            <Icon name="send" size={15} />
            <span className="m-hide">Send</span>
          </button>
        </form>
      )}
    </div>
  );
}
