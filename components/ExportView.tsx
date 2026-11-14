"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { caseClosed, type CaseItem } from "@/components/CaseList";
import { Avatar, Icon } from "@/components/Icon";
import { firstName, SegBar } from "@/components/ui";
import { toast } from "@/components/work";
import type { Role } from "@/lib/auth";
import { caseRef, closedStatus } from "@/lib/status";
import { addDaysISO, diffDays, fmtShort, todayISO, weekday } from "@/lib/time";

type State = "open" | "late" | "review" | "closed" | "all";
type When = "any" | "week" | "month" | "custom";
const STATES: [State, string][] = [
  ["all", "All"],
  ["open", "Open"],
  ["late", "Past due"],
  ["review", "Needs review"],
  ["closed", "Closed"],
];
const WHEN: [When, string][] = [
  ["any", "Any time"],
  ["week", "This week"],
  ["month", "This month"],
  ["custom", "Pick dates"],
];

export default function ExportView({ cases, role, today }: { cases: CaseItem[]; role: Role; today: string }) {
  const lead = role !== "member";
  const [state, setState] = useState<State>("all");
  const [owner, setOwner] = useState("all");
  const [when, setWhen] = useState<When>("any");
  const [from, setFrom] = useState(addDaysISO(today, -30));
  const [to, setTo] = useState(today);
  const [needle, setNeedle] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState(true);
  const [emails, setEmails] = useState(false);
  const [busy, setBusy] = useState(false);
  const allBox = useRef<HTMLInputElement>(null);

  const owners = useMemo(() => {
    const m = new Map<string, { id: string; name: string; lead: boolean }>();
    cases.forEach((c) => m.set(c.owner_id, { id: c.owner_id, name: c.owner_name, lead: c.owner_lead }));
    return [...m.values()].sort((a, b) => Number(b.lead) - Number(a.lead) || a.name.localeCompare(b.name));
  }, [cases]);

  const added = (c: CaseItem) => todayISO(new Date(c.created_at));
  const late = (p: CaseItem["points"][number]) => !closedStatus(p.status) && !!p.due && diffDays(p.due, today) < 0;
  const tests: Record<State, (c: CaseItem) => boolean> = {
    all: () => true,
    open: (c) => !caseClosed(c),
    late: (c) => c.points.some(late),
    review: (c) => c.points.some((p) => p.status === "done"),
    closed: caseClosed,
  };
  const weekStart = addDaysISO(today, -((weekday(today) + 6) % 7));
  const monthStart = today.slice(0, 8) + "01";
  const inWhen = (c: CaseItem) => {
    const d = added(c);
    if (when === "week") return d >= weekStart;
    if (when === "month") return d >= monthStart;
    if (when === "custom") return (!from || d >= from) && (!to || d <= to);
    return true;
  };

  const base = cases.filter((c) => (!lead || owner === "all" || c.owner_id === owner) && inWhen(c));
  const counts = Object.fromEntries(STATES.map(([k]) => [k, base.filter(tests[k]).length])) as Record<State, number>;
  const q = needle.trim().toLowerCase();
  const shown = base
    .filter(tests[state])
    .filter((c) => !q || `${caseRef(c.id)} ${c.subject} ${c.company} ${c.from_name} ${c.owner_name}`.toLowerCase().includes(q))
    .sort((a, b) => Number(b.id) - Number(a.id));

  const shownPicked = shown.filter((c) => picked.has(c.id)).length;
  const allShown = shown.length > 0 && shownPicked === shown.length;
  useEffect(() => {
    if (allBox.current) allBox.current.indeterminate = shownPicked > 0 && !allShown;
  }, [shownPicked, allShown]);

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () =>
    setPicked((s) => {
      const n = new Set(s);
      if (allShown) shown.forEach((c) => n.delete(c.id));
      else shown.forEach((c) => n.add(c.id));
      return n;
    });

  const chosen = cases.filter((c) => picked.has(c.id));
  const pointCount = chosen.reduce((n, c) => n + c.points.length, 0);
  const [d, m, y] = [Number(today.slice(8)), ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(today.slice(5, 7)) - 1], today.slice(0, 4)];
  const fileName = `Shipping-Tickets-cases-${d}-${m}-${y}.xlsx`;

  const describe = () => {
    const parts: string[] = [];
    if (state !== "all") parts.push(STATES.find(([k]) => k === state)![1]);
    if (lead && owner !== "all") parts.push(owners.find((o) => o.id === owner)?.name ?? "");
    if (when === "custom") parts.push(`Added ${from ? fmtShort(from) : "any time"} to ${to ? fmtShort(to) : "today"}`);
    else if (when !== "any") parts.push(`Added ${WHEN.find(([k]) => k === when)![1].toLowerCase()}`);
    if (q) parts.push(`Search: "${needle.trim()}"`);
    return parts.length ? `Filters on screen when exported: ${parts.join(" · ")}.` : "";
  };

  const download = async () => {
    if (!chosen.length || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: chosen.map((c) => c.id), history, emails, filters: describe() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast(j.error ?? "The export didn't work. Try again.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast(`Downloaded ${fileName}`);
    } catch {
      toast("The export didn't work. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-in">
      <header className="ph">
        <div>
          <Link className="back" href="/cases">
            <Icon name="back" size={15} />
            Cases
          </Link>
          <h1 className="h1">Export to Excel</h1>
          <p className="lede opt">Pick the cases you want, or select them all. You get one clean Excel file with a summary, the cases, every point and its history.</p>
        </div>
      </header>

      <div className="exp-grid">
        <div className="exp-main">
          <div className="filters">
            <div className="seg" role="group" aria-label="Show">
              {STATES.map(([k, l]) => (
                <button key={k} type="button" aria-pressed={state === k} onClick={() => setState(k)}>
                  {l}
                  <span className="n">{counts[k]}</span>
                </button>
              ))}
            </div>
            <label className="find">
              <Icon name="search" size={15} />
              <span className="sr">Filter cases</span>
              <input type="search" placeholder="Filter by sender, subject or ID" value={needle} onChange={(e) => setNeedle(e.target.value)} autoComplete="off" />
            </label>
          </div>
          <div className="filters">
            <div className="seg" role="group" aria-label="Added">
              {WHEN.map(([k, l]) => (
                <button key={k} type="button" aria-pressed={when === k} onClick={() => setWhen(k)}>
                  {l}
                </button>
              ))}
            </div>
            {when === "custom" && (
              <span className="exp-dates">
                <label className="sr" htmlFor="ex-from">
                  Added from
                </label>
                <input id="ex-from" type="date" className="inp inp-date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
                <span className="muted small">to</span>
                <label className="sr" htmlFor="ex-to">
                  Added until
                </label>
                <input id="ex-to" type="date" className="inp inp-date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
              </span>
            )}
            {lead && owners.length > 1 && (
              <div className="chips" role="group" aria-label="Owner">
                <button type="button" className="chip all" aria-pressed={owner === "all"} onClick={() => setOwner("all")}>
                  Everyone
                </button>
                {owners.map((o) => (
                  <button key={o.id} type="button" className="chip" aria-pressed={owner === o.id} onClick={() => setOwner(o.id)}>
                    <Avatar name={o.name} lead={o.lead} size="xs" />
                    {firstName(o.name)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <section className="panel" aria-label="Cases to export">
            <div className="xrow xh">
              <input ref={allBox} type="checkbox" checked={allShown} onChange={toggleAll} disabled={!shown.length} aria-label="Select all shown cases" />
              <span>
                <b>{allShown ? "All shown cases selected" : `Select all shown (${shown.length})`}</b>
              </span>
              <span className="sp" />
              {picked.size > 0 && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPicked(new Set())}>
                  Clear {picked.size} selected
                </button>
              )}
            </div>
            <div className="xlist">
              {shown.map((c) => {
                const on = picked.has(c.id);
                const appr = c.points.filter((p) => p.status === "approved").length;
                return (
                  <label key={c.id} className={`xrow${on ? " on" : ""}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(c.id)} />
                    <span className="cid">{caseRef(c.id)}</span>
                    <span className="x-main">
                      <span className="x-subj">{c.subject}</span>
                      <span className="x-sub">
                        {c.company || c.from_name || "Unknown sender"}
                        {lead ? ` · ${firstName(c.owner_name)}` : ""}
                      </span>
                    </span>
                    <span className="x-prog">
                      {caseClosed(c) ? (
                        <span className="stamp sm">Closed</span>
                      ) : (
                        <>
                          <SegBar statuses={c.points.map((p) => p.status)} />
                          <span className="tnum small muted">
                            {appr}/{c.points.length}
                          </span>
                        </>
                      )}
                    </span>
                    <span className="x-date small muted">{fmtShort(added(c))}</span>
                  </label>
                );
              })}
              {!shown.length && <p className="empty">{cases.length ? "No cases match these filters." : "No cases yet. Add an email first."}</p>}
            </div>
          </section>
        </div>

        <aside className="panel exp-side" aria-label="Your export">
          <div className="panel-h">
            <h2>Your export</h2>
          </div>
          <div className="exp-b">
            <div className="exp-count">
              <span className="val">{chosen.length}</span>
              <span>
                case{chosen.length === 1 ? "" : "s"} · {pointCount} point{pointCount === 1 ? "" : "s"}
              </span>
            </div>
            <div className="exp-opts">
              <label className="chg-row">
                <input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} />
                <span>Include updates and remarks history</span>
              </label>
              <label className="chg-row">
                <input type="checkbox" checked={emails} onChange={(e) => setEmails(e.target.checked)} />
                <span>Include the email text (bigger file)</span>
              </label>
            </div>
            <div className="exp-tabs">
              <span className="flabel">Tabs in the file</span>
              <ul>
                <li>
                  <b>Summary</b> totals and a table per person
                </li>
                <li>
                  <b>Cases</b> one row per case
                </li>
                <li>
                  <b>Points</b> status, deadline, days late, latest update
                </li>
                {history && (
                  <li>
                    <b>Change log</b> every update, remark and change, in order
                  </li>
                )}
                {emails && (
                  <li>
                    <b>Emails</b> original and replies, with their text
                  </li>
                )}
              </ul>
            </div>
            <button type="button" className="btn btn-primary btn-block" onClick={download} disabled={!chosen.length || busy} aria-busy={busy}>
              {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="download" size={15} />}
              {busy ? "Building your file" : chosen.length ? "Download Excel file" : "Pick at least one case"}
            </button>
            <span className="hint">
              {fileName} · times are UAE time{role === "member" ? " · only your own cases" : ""}
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
