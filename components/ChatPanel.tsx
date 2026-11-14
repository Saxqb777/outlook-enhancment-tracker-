"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { askAI, postMessage, removeChatFile } from "@/app/actions/chat";
import { AttachChips, AttachClip, FileList, useAttach, useChatDrop } from "@/components/Attach";
import { addPoint, setPointDue, setPointStatus } from "@/app/actions/work";
import { Avatar, Icon } from "@/components/Icon";
import { firstName } from "@/components/ui";
import { Pop, run, StatusControl, toast, useViewOnly } from "@/components/work";
import type { Role } from "@/lib/auth";
import type { FeedItem } from "@/lib/chat";
import type { ChatAction } from "@/lib/extract";
import type { Status } from "@/lib/status";
import { fmtWhen } from "@/lib/time";

type P = { id: string; text: string; status: Status };
const QUICK = ["What's still open?", "Summarise this case for a handover", "Draft a reply to the sender"];

export default function ChatPanel({ caseId, points, role, leadName, today, active }: { caseId: string; points: P[]; role: Role; leadName: string; today: string; active: boolean }) {
  const viewOnly = useViewOnly();
  const router = useRouter();
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [text, setText] = useState("");
  const [about, setAbout] = useState("");
  const [ai, setAi] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [changing, setChanging] = useState(false);
  const [used, setUsed] = useState<Set<string>>(new Set());
  const [sending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const changeBtn = useRef<HTMLButtonElement>(null);
  const count = useRef(0);
  const att = useAttach("apv");
  const drop = useChatDrop(att, !ai);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/${caseId}${active ? "?read=1" : ""}`, { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { items: FeedItem[] };
      setItems(j.items);
    } catch {
      /* offline: keep what we have */
    }
  }, [caseId, active]);

  // Live: check for new messages every few seconds while this tab is on screen.
  useEffect(() => {
    const w = window as unknown as { __chatOpen?: string | null };
    if (active) w.__chatOpen = caseId;
    return () => {
      if (w.__chatOpen === caseId) w.__chatOpen = null;
    };
  }, [active, caseId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && void load(), active ? 4000 : 15000);
    return () => clearInterval(t);
  }, [load, active]);

  useEffect(() => {
    const n = items?.length ?? 0;
    if (n > count.current) {
      const el = box.current;
      if (el && (count.current === 0 || el.scrollHeight - el.scrollTop - el.clientHeight < 240)) end.current?.scrollIntoView({ block: "end" });
      if (count.current > 0) router.refresh();
    }
    count.current = n;
  }, [items, router]);

  const send = (q?: string) => {
    const body = (q ?? text).trim();
    const useAi = ai || !!q;
    const files = useAi ? [] : att.uploaded;
    if ((!body && !files.length) || sending || thinking || att.busy) return;
    setText("");
    if (useAi) {
      setThinking(true);
      setItems((v) => [...(v ?? []), { key: `tmp${Date.now()}`, kind: "text", id: null, who: "You", lead: role === "lead", mine: true, body, point: null, actions: null, at: new Date().toISOString() }]);
      void askAI(caseId, body)
        .then((r) => !r.ok && toast(r.error))
        .catch(() => toast("The AI couldn't answer. Check your connection and try again."))
        .finally(() => {
          setThinking(false);
          void load();
        });
      return;
    }
    start(async () => {
      if (await run(postMessage(caseId, body, about || null, files))) {
        setAbout("");
        att.clear();
        await load();
      } else setText(body);
    });
  };

  const apply = (key: string, a: ChatAction) => {
    const p = a.type === "add_point" ? null : points[a.point - 1];
    start(async () => {
      const ok =
        a.type === "add_point" ? await run(addPoint(caseId, a.text, a.due || null)) : !p ? false : a.type === "status" ? await run(setPointStatus(p.id, a.status)) : await run(setPointDue(p.id, a.due));
      if (ok) {
        setUsed((s) => new Set(s).add(key));
        toast("Done.");
        await load();
        router.refresh();
      }
    });
  };

  const unreadNote = items && !items.length;
  return (
    <div className="chat">
      <div className="chat-feed" ref={box} aria-live="polite">
        {items === null && <p className="hint chat-empty">Loading the conversation…</p>}
        {unreadNote && (
          <div className="chat-empty">
            <Icon name="chat" size={26} />
            <b>Talk about this case here</b>
            <span>Only the people on this case and the Leads can see it. Status changes, replies and files show up here too.</span>
          </div>
        )}
        {items?.map((m, i) => {
          const prev = items[i - 1];
          const newDay = !prev || prev.at.slice(0, 10) !== m.at.slice(0, 10);
          const when = fmtWhen(m.at, today);
          return (
            <div key={m.key}>
              {newDay && <div className="chat-day">{when.split(",")[0]}</div>}
              {m.kind === "event" || m.kind === "system" ? (
                <div className="chat-ev">
                  <span>
                    {m.who && <b>{firstName(m.who)} </b>}
                    {m.body}
                  </span>
                  <time>{when.split(", ")[1]}</time>
                </div>
              ) : (
                <div className={`msg${m.mine ? " mine" : ""}${m.kind === "ai" ? " ai" : ""}`}>
                  {!m.mine &&
                    (m.kind === "ai" ? (
                      <span className="av av-sm ai-av">
                        <Icon name="spark" size={14} />
                      </span>
                    ) : (
                      <Avatar name={m.who ?? "?"} lead={m.lead} size="sm" />
                    ))}
                  <div className="msg-b">
                    <div className="msg-h">
                      <b>{m.kind === "ai" ? "AI" : m.mine ? "You" : (m.who ?? "Someone")}</b>
                      {m.point && <span className="tag">{m.point}</span>}
                      <time>{when.split(", ")[1]}</time>
                    </div>
                    {m.body && <div className="msg-t">{m.body}</div>}
                    {!!m.files?.length && (
                      <FileList
                        files={m.files}
                        base="/chat-file"
                        onRemove={
                          role === "lead" && !viewOnly
                            ? (f) => {
                                if (window.confirm(`Remove "${f.name}" from the chat for good?`)) void run(removeChatFile(f.id)).then((ok) => {
                                  if (!ok) return;
                                  toast("File removed.");
                                  void load();
                                });
                              }
                            : undefined
                        }
                      />
                    )}
                    {m.kind === "ai" && !!m.actions?.length && !viewOnly && (
                      <div className="msg-acts">
                        {m.actions.map((a, k) => {
                          const key = `${m.key}-${k}`;
                          return (
                            <button key={key} type="button" className="btn btn-sm" disabled={used.has(key) || sending} onClick={() => apply(key, a)}>
                              <Icon name={used.has(key) ? "check" : "plus"} size={13} />
                              {a.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {m.kind === "ai" && (
                      <button type="button" className="link-btn msg-copy" onClick={() => navigator.clipboard.writeText(m.body).then(() => toast("Copied."))}>
                        Copy
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {thinking && (
          <div className="msg ai">
            <span className="av av-sm ai-av">
              <Icon name="spark" size={14} />
            </span>
            <div className="msg-b">
              <div className="msg-t typing">
                <i />
                <i />
                <i />
              </div>
            </div>
          </div>
        )}
        <div ref={end} />
      </div>

      {!viewOnly && (
        <div className={`chat-in${drop.over ? " over" : ""}`} {...drop.zone}>
          {drop.over && <div className="chat-dropnote">Drop to attach to your message</div>}
          {ai && (
            <div className="chat-quick">
              {QUICK.map((qq) => (
                <button key={qq} type="button" className="chip all" onClick={() => send(qq)} disabled={thinking}>
                  {qq}
                </button>
              ))}
            </div>
          )}
          <textarea
            className="inp"
            rows={2}
            value={text}
            maxLength={4000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={ai ? "Ask the AI about this case…" : "Message the people on this case… drop a file here to attach it"}
            aria-label={ai ? "Ask the AI" : "Message"}
            onPaste={drop.onPaste}
          />
          {!ai && <AttachChips att={att} />}
          <div className="chat-bar">
            <button type="button" className={`btn btn-sm ai-btn${ai ? " on" : ""}`} aria-pressed={ai} onClick={() => setAi((v) => !v)} title="Ask the AI about this case. Everyone on the case sees the answer.">
              <Icon name="spark" size={14} />
              Ask AI
            </button>
            <button ref={changeBtn} type="button" className="btn btn-sm btn-ghost" onClick={() => setChanging((v) => !v)} aria-haspopup="menu" aria-expanded={changing}>
              <Icon name="check" size={14} />
              Change a status
            </button>
            {!ai && points.length > 0 && (
              <select className="inp chat-about" value={about} onChange={(e) => setAbout(e.target.value)} aria-label="About which point">
                <option value="">About: the whole case</option>
                {points.map((p, i) => (
                  <option key={p.id} value={p.id}>
                    About point {i + 1}
                  </option>
                ))}
              </select>
            )}
            <span className="sp" />
            {!ai && <AttachClip att={att} />}
            <button type="button" className="btn btn-sm btn-primary" onClick={() => send()} disabled={(!text.trim() && (ai || !att.uploaded.length)) || sending || thinking || att.busy}>
              <Icon name="send" size={14} />
              {att.busy ? "Uploading…" : ai ? "Ask" : "Send"}
              <kbd className="kbd">Enter</kbd>
            </button>
          </div>
          {changing && (
            <Pop anchor={changeBtn.current} onClose={() => setChanging(false)} label="Change a status">
              <div className="menu-h">Change a status</div>
              <ul className="chat-pts">
                {points.map((p, i) => (
                  <li key={p.id}>
                    <span className="tag">{i + 1}</span>
                    <span className="trunc">{p.text}</span>
                    <StatusControl pointId={p.id} status={p.status} role={role} leadName={leadName} />
                  </li>
                ))}
              </ul>
            </Pop>
          )}
        </div>
      )}
    </div>
  );
}
