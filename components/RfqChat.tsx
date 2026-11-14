"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AttachChips, AttachClip, FileList, useAttach, useChatDrop } from "@/components/Attach";
import type { Uploaded } from "@/lib/attach-rules";
import { Icon } from "@/components/Icon";
import { poll, toast } from "@/components/work";

type Msg = { id: string; kind: "text" | "system" | "internal"; body: string; at: string; who: string; side: "team" | "vendor"; files?: { id: string; name: string; mime: string; size: number }[] };
type Result = { ok: true } | { ok: false; error: string };

const when = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

/** The chat on one request with one vendor. Used by the team (side "team") and in the vendor portal (side "vendor"). */
export default function RfqChat({
  url, send, side, canWrite, draft, onDraftUsed, placeholder, attachKey = "apv", onRemoveFile,
}: {
  url: string; send: (body: string, files: Uploaded[]) => Promise<Result>; side: "team" | "vendor"; canWrite: boolean; draft?: string; onDraftUsed?: () => void; placeholder?: string;
  attachKey?: "apv" | "vq"; onRemoveFile?: (id: string) => Promise<Result>;
}) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const count = useRef(0);
  const att = useAttach(attachKey);
  const drop = useChatDrop(att, canWrite);

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
    if ((!body && !att.uploaded.length) || busy || att.busy) return;
    setBusy(true);
    try {
      const r = await send(body, att.uploaded);
      if (!r.ok) toast(r.error);
      else {
        setText("");
        att.clear();
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
              {m.body && <p>{m.body}</p>}
              {!!m.files?.length && (
                <FileList
                  files={m.files}
                  base="/chat-file"
                  onRemove={
                    onRemoveFile
                      ? (f) => {
                          if (window.confirm(`Remove "${f.name}" from the chat for good?`)) void onRemoveFile(f.id).then((r) => (r.ok ? (toast("File removed."), load()) : toast(r.error)));
                        }
                      : undefined
                  }
                />
              )}
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
          className={`rq-chat-in${drop.over ? " over" : ""}`}
          {...drop.zone}
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
            onPaste={drop.onPaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <AttachClip att={att} />
          <button type="submit" className="btn btn-primary" disabled={(!text.trim() && !att.uploaded.length) || busy || att.busy} aria-label="Send">
            <Icon name="send" size={15} />
            <span className="m-hide">{att.busy ? "Uploading…" : "Send"}</span>
            <kbd className="kbd">Enter</kbd>
          </button>
          {drop.over && <div className="chat-dropnote">Drop to attach to your message</div>}
          <AttachChips att={att} />
        </form>
      )}
    </div>
  );
}
