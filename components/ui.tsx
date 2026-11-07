// Small presentational pieces shared by server and client screens. No hooks here.
import { Icon } from "@/components/Icon";
import { PRIORITY_LABEL, STATUS_LABEL, type Priority, type Status } from "@/lib/status";
import { dueInfo } from "@/lib/time";

const ring = { cx: 8, cy: 8, r: 5.6, fill: "none", stroke: "currentColor", strokeWidth: 1.6 } as const;

export function Glyph({ s }: { s: Status }) {
  return (
    <svg className={`sg st-${s}`} viewBox="0 0 16 16" aria-hidden="true">
      {s === "todo" && <circle {...ring} strokeDasharray="2.4 2.1" />}
      {s === "progress" && (
        <>
          <circle {...ring} />
          <path d="M8 3.6a4.4 4.4 0 0 1 0 8.8z" fill="currentColor" />
        </>
      )}
      {s === "wait" && (
        <>
          <circle {...ring} />
          <path d="M6.5 5.9v4.2M9.5 5.9v4.2" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
        </>
      )}
      {s === "done" && (
        <>
          <circle {...ring} />
          <path d="m5.4 8.2 1.8 1.8 3.4-3.6" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {s === "approved" && (
        <>
          <circle cx="8" cy="8" r="6.4" fill="currentColor" />
          <path d="m5.3 8.2 1.9 1.9 3.6-3.8" fill="none" stroke="#fff" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

export function Pill({ s, label }: { s: Status; label?: string }) {
  return (
    <span className={`pill st-${s}`}>
      <Glyph s={s} />
      <span>{label ?? STATUS_LABEL[s]}</span>
    </span>
  );
}

export function Prio({ level }: { level: Priority }) {
  const n = { low: 1, normal: 2, high: 3 }[level] ?? 2;
  return (
    <span className={`prio prio-${level}`}>
      <svg viewBox="0 0 12 12" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <rect key={i} x={1 + i * 4} y={9 - i * 3} width="2.6" height={3 + i * 3} rx="1" fill={i < n ? "currentColor" : "rgba(17,22,31,.16)"} />
        ))}
      </svg>
      {PRIORITY_LABEL[level] ?? "Normal"}
    </span>
  );
}

export function SegBar({ statuses }: { statuses: Status[] }) {
  const approved = statuses.filter((s) => s === "approved").length;
  return (
    <span className="segbar" role="img" aria-label={`${approved} of ${statuses.length} points approved`}>
      {statuses.map((s, i) => (
        <i key={i} className={`st-${s}`} />
      ))}
    </span>
  );
}

export function DueTag({ due, status, today }: { due: string | null; status: string; today: string }) {
  const info = dueInfo(due, status, today);
  return (
    <span className={`due ${info.cls}`} title={info.title}>
      <Icon name={info.cls === "late" ? "flag" : "cal"} size={14} />
      <span>{info.text}</span>
    </span>
  );
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
export const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || "Someone";
