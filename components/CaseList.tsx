"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { bulkSetOwner } from "@/app/actions/manage";
import { toast, useViewOnly } from "@/components/work";
import { Avatar, Icon } from "@/components/Icon";
import { DueTag, firstName, Prio, SegBar } from "@/components/ui";
import { ListKeys } from "@/components/Shortcuts";
import type { Role } from "@/lib/auth";
import { caseRef, closedStatus, type Priority, type Status } from "@/lib/status";
import { diffDays, fmtShort, todayISO } from "@/lib/time";

export type CaseItem = {
  id: string;
  subject: string;
  company: string;
  from_name: string;
  priority: Priority;
  deadline: string | null;
  owner_id: string;
  owner_name: string;
  owner_lead: boolean;
  created_at: string;
  points: { id: string; status: Status; due: string | null; text?: string }[];
  members?: { id: string; name: string }[];
  refs?: string;
  unread?: number;
};

type Filter = "open" | "late" | "review" | "closed" | "all";
const LABELS: [Filter, string][] = [
  ["open", "Open"],
  ["late", "Past due"],
  ["review", "Needs review"],
  ["closed", "Closed"],
  ["all", "All"],
];

export const caseClosed = (c: CaseItem) => c.points.length > 0 && c.points.every((p) => p.status === "approved");

export default function CaseList({
  cases,
  role,
  today,
  initial = "open",
  initialQ = "",
  people = [],
}: {
  cases: CaseItem[];
  role: Role;
  today: string;
  initial?: Filter;
  initialQ?: string;
  people?: { id: string; name: string }[];
}) {
  const lead = role === "lead";
  const viewOnly = useViewOnly();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>(initialQ ? "all" : initial);
  const [owner, setOwner] = useState("all");
  const [q, setQ] = useState(initialQ);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [to, setTo] = useState("");
  const [moving, startMove] = useTransition();
  const canBulk = lead && !viewOnly && people.length > 1;
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const moveAll = () =>
    startMove(async () => {
      const r = await bulkSetOwner([...picked], to);
      if (!r.ok) return toast(r.error);
      toast(`${r.moved} case${r.moved === 1 ? "" : "s"} handed to ${people.find((p) => p.id === to)?.name ?? "them"}.`);
      setPicked(new Set());
      setSelecting(false);
      router.refresh();
    });

  const owners = useMemo(() => {
    const m = new Map<string, { id: string; name: string; lead: boolean }>();
    cases.forEach((c) => m.set(c.owner_id, { id: c.owner_id, name: c.owner_name, lead: c.owner_lead }));
    return [...m.values()].sort((a, b) => Number(b.lead) - Number(a.lead) || a.name.localeCompare(b.name));
  }, [cases]);

  const late = (p: CaseItem["points"][number]) => !closedStatus(p.status) && !!p.due && diffDays(p.due, today) < 0;
  const tests: Record<Filter, (c: CaseItem) => boolean> = {
    open: (c) => !caseClosed(c),
    late: (c) => c.points.some(late),
    review: (c) => c.points.some((p) => p.status === "done"),
    closed: caseClosed,
    all: () => true,
  };

  let list = lead && owner !== "all" ? cases.filter((c) => c.owner_id === owner || c.members?.some((m) => m.id === owner)) : cases;
  const counts = Object.fromEntries(LABELS.map(([k]) => [k, list.filter(tests[k]).length])) as Record<Filter, number>;
  list = list.filter(tests[filter]);
  const needle = q.trim().toLowerCase();
  if (needle) {
    list = list.filter((c) =>
      `${caseRef(c.id)} ${c.subject} ${c.from_name} ${c.company} ${c.owner_name} ${c.refs ?? ""} ${(c.members ?? []).map((m) => m.name).join(" ")} ${c.points.map((p) => p.text ?? "").join(" ")}`.toLowerCase().includes(needle),
    );
  }
  const nextDue = (c: CaseItem) =>
    c.points
      .filter((p) => !closedStatus(p.status) && p.due)
      .map((p) => p.due!)
      .sort()[0] ?? null;
  list = [...list].sort((a, b) => {
    const ca = caseClosed(a);
    const cb = caseClosed(b);
    if (ca !== cb) return Number(ca) - Number(cb);
    if (ca) return b.created_at.localeCompare(a.created_at);
    const na = nextDue(a) ?? a.deadline ?? "9999";
    const nb = nextDue(b) ?? b.deadline ?? "9999";
    return na.localeCompare(nb) || b.created_at.localeCompare(a.created_at);
  });

  return (
    <>
      <div className="filters">
        <div className="seg" role="group" aria-label="Show">
          {LABELS.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {l}
              <span className="n">{counts[k]}</span>
            </button>
          ))}
        </div>
        {lead && owners.length > 1 && (
          <div className="chips" role="group" aria-label="Owner">
            <button type="button" className="chip all" aria-pressed={owner === "all"} onClick={() => setOwner("all")}>
              Everyone
            </button>
            {owners.map((m) => (
              <button key={m.id} type="button" className="chip" aria-pressed={owner === m.id} onClick={() => setOwner(m.id)}>
                <Avatar name={m.name} lead={m.lead} size="xs" />
                {firstName(m.name)}
              </button>
            ))}
          </div>
        )}
        {canBulk && (
          <button type="button" className={`btn btn-sm${selecting ? " btn-primary" : ""}`} onClick={() => (setSelecting((v) => !v), setPicked(new Set()))}>
            {selecting ? "Done selecting" : "Select"}
          </button>
        )}
        <label className="find">
          <Icon name="search" size={15} />
          <span className="sr">Filter cases</span>
          <input type="search" placeholder="Filter by sender, subject or ID" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        </label>
        <ListKeys />
      </div>

      <section className="panel" aria-label="Cases">
        <div className="list">
          <div className={`crow h${lead ? "" : " nm"}`} aria-hidden="true">
            <span className="c-id">ID</span>
            <span>Email</span>
            {lead && <span className="c-mem">Owner</span>}
            <span className="c-prog">Points approved</span>
            <span className="c-due">Next deadline</span>
            <span className="c-prio">Priority</span>
            <span className="row-chat">Chat</span>
          </div>
          {list.map((c) => {
            const open = c.points.filter((p) => !closedStatus(p.status));
            const next = nextDue(c);
            const appr = c.points.filter((p) => p.status === "approved").length;
            const closed = caseClosed(c);
            return (
              <Link
                key={c.id}
                className={`crow${lead ? "" : " nm"}${selecting && picked.has(c.id) ? " picked" : ""}`}
                href={`/cases/${c.id}`}
                onClick={(e) => {
                  if (!selecting) return;
                  e.preventDefault();
                  toggle(c.id);
                }}
              >
                <span className="c-id cid">
                  {selecting ? <input type="checkbox" readOnly checked={picked.has(c.id)} tabIndex={-1} aria-label={`Select ${caseRef(c.id)}`} /> : caseRef(c.id)}
                </span>
                <span className="c-main">
                  <span className="c-subj">
                    {!!c.unread && <span className="unread-dot" title={`${c.unread} new in chat`} />}
                    {c.subject}
                  </span>
                  <span className="c-from">
                    <span className="cid cid-m">{caseRef(c.id)}</span>
                    <span className="trunc">{c.company || c.from_name || "Unknown sender"}</span>
                    <span className="added">Added {fmtShort(todayISO(new Date(c.created_at)))}</span>
                    {!!c.members?.length && (
                      <span className="shared-tag" title={`Shared with ${c.members.map((m) => m.name).join(", ")}`}>
                        <Icon name="team" size={12} />
                        Shared
                      </span>
                    )}
                  </span>
                </span>
                {lead && (
                  <span className="c-mem">
                    <Avatar name={c.owner_name} lead={c.owner_lead} size="xs" />
                    <span>
                      {firstName(c.owner_name)}
                      {c.members?.length ? ` +${c.members.length}` : ""}
                    </span>
                  </span>
                )}
                <span className="c-prog">
                  <SegBar statuses={c.points.map((p) => p.status)} />
                  <span className="tnum small muted">
                    {appr}/{c.points.length}
                  </span>
                </span>
                <span className="c-due">
                  {closed ? (
                    <span className="stamp sm">Closed</span>
                  ) : next ? (
                    <DueTag due={next} status="todo" today={today} />
                  ) : open.length ? (
                    <DueTag due={c.deadline} status="todo" today={today} />
                  ) : (
                    <span className="small muted">In review</span>
                  )}
                </span>
                <span className="c-prio">
                  <Prio level={c.priority} />
                </span>
                <span
                  className={`chat-link row-chat${c.unread ? " new" : ""}`}
                  role="link"
                  tabIndex={0}
                  title="Open the chat for this case"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    router.push(`/cases/${c.id}?tab=chat`);
                  }}
                >
                  <Icon name="chat" size={14} />
                  {c.unread ? c.unread : ""}
                </span>
              </Link>
            );
          })}
          {selecting && (
            <div className="bulk-bar">
              <b>{picked.size} selected</b>
              <span className="sp" />
              <label className="sr" htmlFor="bulk-to">
                Hand over to
              </label>
              <select id="bulk-to" className="inp" value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">Hand over to…</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-primary btn-sm" disabled={!picked.size || !to || moving} onClick={moveAll}>
                Hand over
              </button>
            </div>
          )}
          {!list.length && (
            <p className="empty">
              {cases.length ? "No cases match. Try another filter." : lead ? "No cases yet. Add an email to create the first one." : "No cases yet. Add an email to start tracking your work."}
            </p>
          )}
        </div>
      </section>
    </>
  );
}
