"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import type { Segment } from "@/lib/highlight";
import { readEmailFile } from "@/lib/mailfile";

export type FileInfo = { name: string; size: number; note: string; blob: File };

const kb = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

// Hands an email from the Add page to a case's reply page without reading it twice.
let handoff: { raw: string; file: FileInfo | null } | null = null;
export function handOff(raw: string, file: FileInfo | null) {
  handoff = { raw, file };
}
export function takeHandoff() {
  const h = handoff;
  handoff = null;
  return h;
}

/** Text + optional file for an email being added, with page-wide drag and drop while `active`. */
export function useEmailSource(active: boolean) {
  const [tab, setTab] = useState<"paste" | "upload">("paste");
  const [raw, setRaw] = useState("");
  const [file, setFile] = useState<FileInfo | null>(null);
  const [opening, setOpening] = useState(false);
  const [fileErr, setFileErr] = useState<string | null>(null);

  const loadFile = async (f: File) => {
    setFileErr(null);
    setOpening(true);
    const r = await readEmailFile(f).finally(() => setOpening(false));
    if ("error" in r) {
      setFileErr(r.error);
      return;
    }
    setRaw(r.text);
    setFile({ name: f.name, size: f.size, note: r.note, blob: f });
    setTab("upload");
  };

  useEffect(() => {
    if (!active) return;
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
    const over = (e: DragEvent) => {
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
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      document.body.classList.remove("filedrag");
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const words = raw.trim() ? raw.trim().split(/\s+/).length : 0;
  return { tab, setTab, raw, setRaw, file, setFile, opening, fileErr, setFileErr, loadFile, words };
}
export type EmailSource = ReturnType<typeof useEmailSource>;

/** Object URL for a picked file, so people can open the original before saving. */
export function useFileUrl(file: FileInfo | null): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file.blob) : null), [file]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return url;
}

export function EmailInputPanel({
  src,
  head,
  err,
  readLabel,
  onRead,
  placeholder,
}: {
  src: EmailSource;
  head?: React.ReactNode;
  err?: { text: string; actions?: React.ReactNode } | null;
  readLabel: string;
  onRead: () => void;
  placeholder: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const url = useFileUrl(src.file);
  const shownErr = src.fileErr ? { text: src.fileErr } : err;
  return (
    <section className="panel add-card">
      <div className="panel-h">
        <div className="seg" role="group" aria-label="How to add">
          <button type="button" aria-pressed={src.tab === "paste"} onClick={() => src.setTab("paste")}>
            <Icon name="edit" size={15} />
            Paste text
          </button>
          <button type="button" aria-pressed={src.tab === "upload"} onClick={() => src.setTab("upload")}>
            <Icon name="upload" size={15} />
            Upload a file
          </button>
        </div>
        {head}
      </div>
      <div className="add-b">
        {src.tab === "paste" ? (
          <>
            <label className="sr" htmlFor="raw">
              Email text
            </label>
            <textarea
              id="raw"
              className="inp raw"
              spellCheck={false}
              value={src.raw}
              onChange={(e) => {
                src.setRaw(e.target.value);
                if (src.file) src.setFile(null);
              }}
              placeholder={placeholder}
            />
          </>
        ) : src.file ? (
          <>
            <div className="filechip">
              <Icon name="mail" />
              <div>
                <b>{src.file.name}</b>
                <span>
                  {kb(src.file.size)} · {src.file.note}
                </span>
              </div>
              {url && (
                <a className="btn btn-sm" href={url} target="_blank" rel="noopener noreferrer">
                  View original
                </a>
              )}
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  src.setFile(null);
                  src.setRaw("");
                }}
              >
                Remove
              </button>
            </div>
            <pre className="peek">
              {src.raw.slice(0, 1500)}
              {src.raw.length > 1500 ? "\n…" : ""}
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
            if (f) void src.loadFile(f);
          }}
        />
        {shownErr && (
          <div className="form-err err-row" role="alert">
            <span>{shownErr.text}</span>
            {"actions" in shownErr && shownErr.actions}
          </div>
        )}
      </div>
      <div className="add-f">
        <span className="hint" aria-live="polite">
          {src.opening
            ? "Opening the file…"
            : src.words
              ? `${src.words.toLocaleString()} words ready to read`
              : "Tip: you can drop an email file anywhere on this page. Full threads are fine."}
        </span>
        <button type="button" className="btn btn-primary" onClick={onRead} disabled={!src.raw.trim() || src.opening}>
          <Icon name="scan" size={15} />
          {readLabel}
        </button>
      </div>
    </section>
  );
}

/** Email body with numbered, clickable highlights for the sentences points came from. */
export function Highlighted({
  segments,
  numbers,
  lit,
  onLit,
  onPick,
}: {
  segments: Segment[];
  numbers: Map<number, number>;
  lit?: number | null;
  onLit?: (n: number | null) => void;
  onPick?: (n: number) => void;
}) {
  return (
    <>
      {segments.map((s, i) =>
        s.n && numbers.has(s.n) ? (
          <span
            key={i}
            className={`src${lit === s.n ? " lit" : ""}`}
            data-src={s.n}
            role={onPick ? "button" : undefined}
            tabIndex={onPick ? 0 : undefined}
            onMouseEnter={() => onLit?.(s.n!)}
            onMouseLeave={() => onLit?.(null)}
            onClick={() => onPick?.(s.n!)}
            onKeyDown={(e) => {
              if (onPick && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onPick(s.n!);
              }
            }}
          >
            <span className="tag" aria-hidden="true">
              {numbers.get(s.n)}
            </span>
            {s.text}
          </span>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

export type ReaderEmail = {
  key: string;
  tab: string;
  label: string;
  subject: string;
  meta: [string, string][];
  body: React.ReactNode;
  note?: string | null;
  fileUrl?: string | null;
  downloadUrl?: string | null;
  isPdf?: boolean;
  fileName?: string | null;
};

/** Full-screen reader for the emails on a case (or the one being added). */
export function MailReader({ emails, start, startView = "text", onClose }: { emails: ReaderEmail[]; start: number; startView?: "text" | "file"; onClose: () => void }) {
  const [i, setI] = useState(Math.min(Math.max(start, 0), emails.length - 1));
  const [view, setView] = useState<"text" | "file">(startView);
  const e = emails[i];
  useEffect(() => {
    const key = (ev: KeyboardEvent) => ev.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  if (!e) return null;
  return createPortal(
    <div className="reader-wrap" onPointerDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div className="reader" role="dialog" aria-modal="true" aria-label="Email">
        <div className="reader-h">
          {emails.length > 1 ? (
            <div className="seg reader-tabs" role="group" aria-label="Emails on this case">
              {emails.map((x, j) => (
                <button
                  key={x.key}
                  type="button"
                  aria-pressed={j === i}
                  onClick={() => {
                    setI(j);
                    setView("text");
                  }}
                >
                  {x.tab}
                </button>
              ))}
            </div>
          ) : (
            <b className="reader-t">{e.tab}</b>
          )}
          <span className="sp" />
          {e.isPdf && e.fileUrl && (
            <div className="seg" role="group" aria-label="Show">
              <button type="button" aria-pressed={view === "text"} onClick={() => setView("text")}>
                Text
              </button>
              <button type="button" aria-pressed={view === "file"} onClick={() => setView("file")}>
                Original PDF
              </button>
            </div>
          )}
          {e.isPdf && e.fileUrl && (
            <a className="btn btn-sm" href={e.fileUrl} target="_blank" rel="noopener noreferrer">
              <Icon name="expand" size={14} />
              Open in new tab
            </a>
          )}
          {e.downloadUrl && (
            <a className="btn btn-sm" href={e.downloadUrl} download={e.fileName ?? undefined}>
              <Icon name="download" size={14} />
              Download original
            </a>
          )}
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        {view === "file" && e.fileUrl ? (
          <iframe className="reader-pdf" src={e.fileUrl} title={e.fileName ?? "Original email"} />
        ) : (
          <div className="reader-b">
            <div className="reader-label">{e.label}</div>
            <h2 className="reader-s">{e.subject || "(No subject)"}</h2>
            <dl className="mail-meta">
              {e.meta.map(([k, v]) => (
                <span key={k} style={{ display: "contents" }}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </span>
              ))}
            </dl>
            {e.note && <p className="reader-note">{e.note}</p>}
            <div className="reader-text">{e.body}</div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
