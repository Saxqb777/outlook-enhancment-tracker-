"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Avatar, Icon } from "@/components/Icon";
import { DueTag, firstName, Prio, SegBar } from "@/components/ui";
import type { Role } from "@/lib/auth";
import { caseRef, closedStatus, type Priority, type Status } from "@/lib/status";
import { diffDays } from "@/lib/time";

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

export default function CaseList({ cases, role, today, initial = "open" }: { cases: CaseItem[]; role: Role; today: string; initial?: Filter }) {
  const lead = role === "lead";
  const [filter, setFilter] = useState<Filter>(initial);
  const [owner, setOwner] = useState("all");
  const [q, setQ] = useState("");

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
      `${caseRef(c.id)} ${c.subject} ${c.from_name} ${c.company} ${c.owner_name} ${(c.members ?? []).map((m) => m.name).join(" ")} ${c.points.map((p) => p.text ?? "").join(" ")}`.toLowerCase().includes(needle),
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
        <label className="find">
          <Icon name="search" size={15} />
          <span className="sr">Filter cases</span>
          <input type="search" placeholder="Filter by sender, subject or ID" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        </label>
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
          </div>
          {list.map((c) => {
            const open = c.points.filter((p) => !closedStatus(p.status));
            const next = nextDue(c);
            const appr = c.points.filter((p) => p.status === "approved").length;
            const closed = caseClosed(c);
            return (
              <Link key={c.id} className={`crow${lead ? "" : " nm"}`} href={`/cases/${c.id}`}>
                <span className="c-id cid">{caseRef(c.id)}</span>
                <span className="c-main">
                  <span className="c-subj">{c.subject}</span>
                  <span className="c-from">
                    <span className="cid cid-m">{caseRef(c.id)}</span>
                    <span className="trunc">{c.company || c.from_name || "Unknown sender"}</span>
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
              </Link>
            );
          })}
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
