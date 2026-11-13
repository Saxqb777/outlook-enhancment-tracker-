"use client";

import { createContext, useContext, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Icon } from "@/components/Icon";
import { ATT_ACCEPT, ATT_MAX_FILES, checkFile, cleanName, isImage, mimeFor, sizeLabel, type Uploaded } from "@/lib/attach-rules";

// "blob": straight to private Vercel file storage. "local": through the app (testing without Vercel storage).
const ModeCtx = createContext<"blob" | "local">("blob");
export function AttachProvider({ local, children }: { local: boolean; children: React.ReactNode }) {
  return <ModeCtx.Provider value={local ? "local" : "blob"}>{children}</ModeCtx.Provider>;
}

type Item = { key: number; file: File; pct: number; state: "up" | "done" | "error"; result?: Uploaded; error?: string };
let seq = 0;

async function send(mode: "blob" | "local", pointId: string, file: File, onPct: (n: number) => void): Promise<Uploaded> {
  const name = cleanName(file.name);
  if (mode === "local") {
    const fd = new FormData();
    fd.append("file", file, name);
    fd.append("pointId", pointId);
    const res = await fetch("/api/attachments/local", { method: "POST", body: fd });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error ?? "Upload failed.");
    onPct(100);
    return { url: j.url, pathname: j.pathname, name, size: file.size };
  }
  // "apv" = a file for an approval request (not tied to a point).
  const r = await upload(pointId === "apv" || pointId === "vq" ? `${pointId}/${name}` : `att/${pointId}/${name}`, file, {
    access: "private",
    handleUploadUrl: "/api/attachments",
    contentType: mimeFor(name) ?? undefined,
    multipart: file.size > 5 * 1024 * 1024,
    onUploadProgress: (p) => onPct(Math.round(p.percentage)),
  });
  return { url: r.url, pathname: r.pathname, name, size: file.size };
}

/** Files picked for one point: they upload as soon as they're chosen. */
export function useAttach(pointId: string) {
  const mode = useContext(ModeCtx);
  const [items, setItems] = useState<Item[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const add = (list: FileList | File[]) => {
    setProblem(null);
    const files = Array.from(list);
    const room = ATT_MAX_FILES - items.length;
    if (files.length > room) setProblem(`Up to ${ATT_MAX_FILES} files at a time.`);
    for (const file of files.slice(0, Math.max(0, room))) {
      const bad = checkFile(file);
      if (bad) {
        setProblem(bad);
        continue;
      }
      const key = ++seq;
      setItems((v) => [...v, { key, file, pct: 0, state: "up" }]);
      send(mode, pointId, file, (pct) => setItems((v) => v.map((x) => (x.key === key ? { ...x, pct } : x))))
        .then((result) => setItems((v) => v.map((x) => (x.key === key ? { ...x, state: "done", pct: 100, result } : x))))
        .catch((e: unknown) =>
          setItems((v) => v.map((x) => (x.key === key ? { ...x, state: "error", error: e instanceof Error ? e.message : "Upload failed." } : x))),
        );
    }
  };
  const remove = (key: number) => setItems((v) => v.filter((x) => x.key !== key));
  const clear = () => {
    setItems([]);
    setProblem(null);
  };
  const busy = items.some((x) => x.state === "up");
  const failed = items.some((x) => x.state === "error");
  const uploaded = items.filter((x) => x.state === "done" && x.result).map((x) => x.result!);
  return { items, add, remove, clear, busy, failed, uploaded, problem };
}
export type AttachState = ReturnType<typeof useAttach>;

/** "Attach files" button plus the chosen files with progress. */
export function AttachPicker({ att, compact = false, disabled = false }: { att: AttachState; compact?: boolean; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`attp${over ? " over" : ""}`}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes("Files")) {
          e.preventDefault();
          e.stopPropagation();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        att.add(e.dataTransfer.files);
      }}
    >
      {att.items.length > 0 && (
        <ul className="attp-list">
          {att.items.map((x) => (
            <li key={x.key} className={`attp-i ${x.state}`}>
              <Icon name={x.state === "error" ? "x" : x.state === "done" ? "check" : "file"} size={14} />
              <span className="attp-n">{x.file.name}</span>
              <span className="attp-s">{x.state === "up" ? `${x.pct}%` : x.state === "error" ? (x.error ?? "Failed") : sizeLabel(x.file.size)}</span>
              <button type="button" className="icon-btn sm" aria-label={`Remove ${x.file.name}`} onClick={() => att.remove(x.key)}>
                <Icon name="x" size={13} />
              </button>
              {x.state === "up" && <i className="attp-bar" style={{ width: `${x.pct}%` }} />}
            </li>
          ))}
        </ul>
      )}
      {att.problem && <span className="form-err sm">{att.problem}</span>}
      <button type="button" className={`btn btn-sm btn-ghost attp-btn${compact ? " c" : ""}`} onClick={() => input.current?.click()} disabled={disabled || att.items.length >= ATT_MAX_FILES}>
        <Icon name="clip" size={15} />
        {compact ? "Attach" : "Attach files"}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        className="sr"
        accept={ATT_ACCEPT}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          if (e.target.files?.length) att.add(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export type FileView = { id: string; name: string; mime: string; size: number };

/** Attached files shown in a point's history: small previews for photos, chips for everything else. */
export function FileList({ files }: { files: FileView[] }) {
  if (!files.length) return null;
  const pics = files.filter((f) => isImage(f.mime));
  const docs = files.filter((f) => !isImage(f.mime));
  return (
    <div className="files">
      {pics.length > 0 && (
        <div className="files-pics">
          {pics.map((f) => (
            <a key={f.id} className="file-pic" href={`/attachments/${f.id}`} target="_blank" rel="noopener noreferrer" title={f.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/attachments/${f.id}`} alt={f.name} loading="lazy" />
            </a>
          ))}
        </div>
      )}
      {docs.map((f) => (
        <a
          key={f.id}
          className="file-chip"
          href={f.mime === "application/pdf" ? `/attachments/${f.id}` : `/attachments/${f.id}?download`}
          target={f.mime === "application/pdf" ? "_blank" : undefined}
          rel="noopener noreferrer"
        >
          <Icon name="file" size={14} />
          <span className="file-n">{f.name}</span>
          <span className="file-s">{sizeLabel(f.size)}</span>
        </a>
      ))}
    </div>
  );
}
