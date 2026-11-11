"use client";

import { useRouter } from "next/navigation";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { setPointStatus } from "@/app/actions/work";
import { Avatar, Icon } from "@/components/Icon";
import { DueTag, firstName, Glyph, Prio } from "@/components/ui";
import { run, StatusControl, StatusDialog, toast, useViewOnly } from "@/components/work";
import type { Uploaded } from "@/lib/attach-rules";
import type { Role } from "@/lib/auth";
import { caseRef, statusBlocked, STATUSES, STATUS_LABEL, closedStatus, type Priority, type Status } from "@/lib/status";
import { diffDays, fmtShort, todayISO } from "@/lib/time";

export type BoardCard = {
  id: string;
  case_id: string;
  text: string;
  status: Status;
  wait_reason: string | null;
  due: string | null;
  subject: string;
  priority: Priority;
  owner_id: string;
  owner_name: string;
  owner_lead: boolean;
  case_added?: string;
  assignee_id?: string | null;
  assignee_name?: string | null;
  last_at: string | null;
};

export default function BoardView({ points, role, leadName, today }: { points: BoardCard[]; role: Role; leadName: string; today: string }) {
  const lead = role === "lead";
  const router = useRouter();
  const [owner, setOwner] = useState("all");
  const [show, setShow] = useState<Status>("todo");
  const [over, setOver] = useState<Status | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ id: string; to: "wait" | "done" } | null>(null);
  const [, start] = useTransition();
  const [list, move] = useOptimistic(points, (state, m: { id: string; status: Status; why?: string }) =>
    state.map((p) => (p.id === m.id ? { ...p, status: m.status, wait_reason: m.why ?? p.wait_reason } : p)),
  );
  const lf = leadName;
  const viewOnly = useViewOnly();

  const owners = useMemo(() => {
    const m = new Map<string, { id: string; name: string; lead: boolean }>();
    points.forEach((p) => m.set(p.owner_id, { id: p.owner_id, name: p.owner_name, lead: p.owner_lead }));
    return [...m.values()].sort((a, b) => Number(b.lead) - Number(a.lead) || a.name.localeCompare(b.name));
  }, [points]);

  const shown = lead && owner !== "all" ? list.filter((p) => p.owner_id === owner) : list;
  const late = (p: BoardCard) => !closedStatus(p.status) && !!p.due && diffDays(p.due, today) < 0;

  const doMove = (id: string, to: Status, why?: string, extra?: { note: string; files: Uploaded[] }) => {
    const p = list.find((x) => x.id === id);
    if (!p || p.status === to) return;
    const blocked = statusBlocked(role, p.status, to);
    if (blocked) return toast(blocked);
    if ((to === "wait" || to === "done") && !extra) return setAsking({ id, to });
    start(async () => {
      move({ id, status: to, why });
      if ((await run(setPointStatus(id, to, why, extra))) && to === "approved") toast("Approved.");
    });
  };

  const empty: Record<Status, string> = {
    todo: "Nothing waiting to start",
    progress: "Nothing in progress",
    wait: "Nothing is blocked",
    done: lead ? "Nothing to review" : "Nothing waiting for review",
    approved: "Nothing approved yet",
  };

  return (
    <>
      {lead && owners.length > 1 && (
        <div className="filters">
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
        </div>
      )}

      <div className="seg board-switch" role="group" aria-label="Show status">
        {STATUSES.map((s) => (
          <button key={s} type="button" aria-pressed={show === s} onClick={() => setShow(s)}>
            <Glyph s={s} />
            {s === "done" ? "Done" : STATUS_LABEL[s]}
            <span className="n">{shown.filter((p) => p.status === s).length}</span>
          </button>
        ))}
      </div>

      <div className="board-wrap">
        <div className="board">
          {STATUSES.map((s) => {
            let items = shown.filter((p) => p.status === s);
            if (s === "approved") items = [...items].sort((a, b) => (b.last_at ?? "").localeCompare(a.last_at ?? ""));
            else items = [...items].sort((a, b) => Number(late(b)) - Number(late(a)) || (a.due ?? "9999").localeCompare(b.due ?? "9999"));
            const visible = s === "approved" ? items.slice(0, 6) : items;
            const nodrop = !!dragging && role === "member" && s === "approved";
            return (
              <section
                key={s}
                className={`col st-${s}${show === s ? " show" : ""}${over === s && !nodrop ? " over" : ""}${nodrop ? " nodrop" : ""}`}
                aria-label={STATUS_LABEL[s]}
                onDragOver={(e) => {
                  if (!dragging || nodrop) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (over !== s) setOver(s);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/x-point") || dragging;
                  setOver(null);
                  setDragging(null);
                  if (id && !nodrop) doMove(id, s);
                }}
              >
                <div className="col-h">
                  <Glyph s={s} />
                  <span>{s === "done" ? "Done, needs review" : STATUS_LABEL[s]}</span>
                  <span className="count">{items.length}</span>
                </div>
                <div className="col-b">
                  {visible.map((p) => {
                    const canMove = !viewOnly && !(role === "member" && p.status === "approved");
                    const open = () => router.push(`/cases/${p.case_id}#pt-${p.id}`);
                    return (
                      <article
                        key={p.id}
                        className={`card${dragging === p.id ? " dragging" : ""}`}
                        tabIndex={0}
                        draggable={canMove}
                        aria-label={`${p.text}, ${STATUS_LABEL[p.status]}`}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/x-point", p.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDragging(p.id);
                        }}
                        onDragEnd={() => {
                          setDragging(null);
                          setOver(null);
                        }}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest("button")) return;
                          open();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && e.target === e.currentTarget) open();
                        }}
                      >
                        <div className="card-top">
                          <span className="cid">{caseRef(p.case_id)}</span>
                          {p.case_added && <span className="added">Added {fmtShort(todayISO(new Date(p.case_added)))}</span>}
                          {p.priority === "high" && <Prio level="high" />}
                          {canMove && <StatusControl pointId={p.id} status={p.status} role={role} leadName={lf} variant="icon" />}
                        </div>
                        <div className="card-t">{p.text}</div>
                        {p.status === "wait" && p.wait_reason && (
                          <div className="card-w">
                            <Icon name="clock" size={14} />
                            <span>{p.wait_reason}</span>
                          </div>
                        )}
                        <div className="card-s">{p.subject}</div>
                        <div className="card-f">
                          {lead ? (
                            <span className="c-mem small">
                              <Avatar name={p.assignee_name ?? p.owner_name} lead={!p.assignee_name && p.owner_lead} size="xs" />
                              {firstName(p.assignee_name ?? p.owner_name)}
                            </span>
                          ) : (
                            <span />
                          )}
                          {p.status === "approved" ? (
                            <span className="stamp sm">
                              <Icon name="check" size={12} />
                              {p.last_at ? fmtShort(todayISO(new Date(p.last_at))) : "Approved"}
                            </span>
                          ) : (
                            <DueTag due={p.due} status={p.status} today={today} />
                          )}
                        </div>
                      </article>
                    );
                  })}
                  {items.length > visible.length && <div className="more">and {items.length - visible.length} more</div>}
                  {!items.length && <div className="col-empty">{empty[s]}</div>}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {!viewOnly && <p className="hint m-hide">Tip: open a card&apos;s menu if you&apos;d rather not drag. Click a card to open its case.</p>}
      {asking && (
        <StatusDialog
          pointId={asking.id}
          to={asking.to}
          onCancel={() => setAsking(null)}
          onSave={(why, extra) => {
            const a = asking;
            setAsking(null);
            doMove(a.id, a.to, why, extra);
          }}
        />
      )}
    </>
  );
}
