import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar, Icon } from "@/components/Icon";
import { firstName, Glyph, plural } from "@/components/ui";
import { ReviewButtons } from "@/components/work";
import { getViewer } from "@/lib/auth";
import { dashboardData, type DashPoint } from "@/lib/dashboard";
import { caseRef, STATUS_LABEL, type Status } from "@/lib/status";
import { diffDays, fmtShort, todayISO } from "@/lib/time";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const OPEN: Status[] = ["todo", "progress", "wait", "done"];
const daysSince = (d: Date | null) => (d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 864e5)) : 0);
const age = (n: number) => (n === 0 ? "today" : n === 1 ? "1 day" : `${n} days`);
const href = (p: DashPoint) => `/cases/${p.case_id}#pt-${p.id}`;

export default async function DashboardPage() {
  const { me } = await getViewer();
  if (me.role === "member") redirect("/");
  const today = todayISO();
  const { points, people, weeks, done, quiet } = await dashboardData(today);

  const isLate = (p: DashPoint) => p.status !== "done" && p.status !== "approved" && !!p.due && diffDays(p.due, today) < 0;
  const open = points.filter((p) => p.status !== "approved");
  const working = open.filter((p) => p.status !== "done");
  const late = working.filter(isLate).sort((a, b) => a.due!.localeCompare(b.due!));
  const review = points.filter((p) => p.status === "done").sort((a, b) => daysSince(b.status_at) - daysSince(a.status_at));
  const waiting = points.filter((p) => p.status === "wait").sort((a, b) => daysSince(b.status_at) - daysSince(a.status_at));
  const dueSoon = working.filter((p) => p.due && !isLate(p) && diffDays(p.due, today) <= 7);
  const openCases = new Set(open.map((p) => p.case_id)).size;
  const judged = done.filter((d) => d.on_time !== null);
  const onTime = judged.length ? Math.round((judged.filter((d) => d.on_time).length / judged.length) * 100) : null;
  const avgDays = done.length ? done.reduce((n, d) => n + d.days, 0) / done.length : null;
  const oldestReview = review.length ? daysSince(review[0].status_at) : 0;

  const rows = people
    .map((u) => {
      const mine = points.filter((p) => p.person_id === u.id);
      const by = (s: Status) => mine.filter((p) => p.status === s).length;
      const d = done.filter((x) => x.person_id === u.id);
      const j = d.filter((x) => x.on_time !== null);
      return {
        ...u,
        todo: by("todo"),
        progress: by("progress"),
        wait: by("wait"),
        done: by("done"),
        approved: by("approved"),
        late: mine.filter(isLate).length,
        openN: mine.filter((p) => p.status !== "approved" && p.status !== "done").length,
        onTime: j.length ? Math.round((j.filter((x) => x.on_time).length / j.length) * 100) : null,
        closed30: d.length,
      };
    })
    .sort((a, b) => b.openN + b.done - (a.openN + a.done));
  const maxLoad = Math.max(1, ...rows.map((r) => r.todo + r.progress + r.wait + r.done));
  const maxWeek = Math.max(1, ...weeks.flatMap((w) => [w.added, w.done]));

  const companies = [...open.reduce((m, p) => m.set(p.company || "No company", (m.get(p.company || "No company") ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxCo = Math.max(1, ...companies.map((c) => c[1]));

  const headline =
    review.length || late.length
      ? [review.length && `${plural(review.length, "point")} waiting for approval`, late.length && `${late.length} past due`].filter(Boolean).join(" · ")
      : "Everything is on track.";

  return (
    <div className="page-in dash">
      <header className="ph">
        <div>
          <div className="date">Dashboard · live</div>
          <h1 className="h1">How the team is doing</h1>
          <p className="lede">{headline}</p>
        </div>
        <div className="ph-act m-hide">
          <Link className="btn" href="/cases/export">
            <Icon name="download" size={15} />
            Export to Excel
          </Link>
        </div>
      </header>

      <section className="stats kpis" aria-label="Key numbers">
        <Link className="stat" href="/cases">
          <span className="lab">Open cases</span>
          <span className="val">{openCases}</span>
          <span className="ctx">{plural(working.length, "point")} being worked on</span>
        </Link>
        <Link className={`stat${review.length ? " attn" : ""}`} href="#review">
          <span className="lab">
            <Glyph s="done" /> Waiting for approval
          </span>
          <span className="val">{review.length}</span>
          <span className="ctx">{review.length ? `oldest has waited ${age(oldestReview)}` : "Nothing to approve"}</span>
        </Link>
        <Link className={`stat${late.length ? " bad" : ""}`} href="#late">
          <span className="lab">
            {late.length > 0 && <i className="dot" />} Past due
          </span>
          <span className="val">{late.length}</span>
          <span className="ctx">{late.length ? `oldest is ${age(-diffDays(late[0].due!, today))} late` : "Nothing is late"}</span>
        </Link>
        <div className="stat">
          <span className="lab">Due in 7 days</span>
          <span className="val">{dueSoon.length}</span>
          <span className="ctx">{waiting.length ? `${waiting.length} blocked (Waiting)` : "Nothing blocked"}</span>
        </div>
        <div className="stat">
          <span className="lab">Done on time</span>
          <span className="val">
            {onTime === null ? "–" : onTime}
            {onTime !== null && <small>%</small>}
          </span>
          <span className="ctx">{judged.length ? `of ${plural(judged.length, "point")} with a deadline, last 30 days` : "No dated points finished yet"}</span>
        </div>
        <div className="stat">
          <span className="lab">Time to done</span>
          <span className="val">
            {avgDays === null ? "–" : avgDays < 1 ? "<1" : avgDays.toFixed(1)}
            {avgDays !== null && <small> days</small>}
          </span>
          <span className="ctx">average from email to Done, last 30 days</span>
        </div>
      </section>

      <div className="grid2 even">
        <section className="panel" id="review">
          <div className="panel-h">
            <h2>
              Waiting for your approval <span className="count">{review.length}</span>
            </h2>
            <span className="hint">Oldest first</span>
          </div>
          {review.length ? (
            <div className="rows scroll">
              {review.map((p) => (
                <div className="row" key={p.id}>
                  <Avatar name={p.person} />
                  <div className="row-main">
                    <Link className="row-t" href={href(p)}>
                      {p.text}
                    </Link>
                    <div className="sub">
                      <span className="cid">{caseRef(p.case_id)}</span>
                      <span>{firstName(p.person)}</span>
                      <span className={daysSince(p.status_at) >= 2 ? "warn-t" : ""}>
                        done {p.status_at ? fmtShort(todayISO(new Date(p.status_at))) : ""} · waiting {age(daysSince(p.status_at))}
                      </span>
                    </div>
                    {p.last_update && <div className="quote">{p.last_update}</div>}
                  </div>
                  <ReviewButtons pointId={p.id} />
                </div>
              ))}
            </div>
          ) : (
            <p className="empty">Nothing to approve. Points show up here when someone marks them Done.</p>
          )}
        </section>

        <section className="panel" id="late">
          <div className="panel-h">
            <h2>
              Past due <span className="count">{late.length}</span>
            </h2>
            <span className="hint">Most overdue first</span>
          </div>
          {late.length ? (
            <div className="rows scroll">
              {late.map((p) => (
                <div className="row" key={p.id}>
                  <Avatar name={p.person} />
                  <div className="row-main">
                    <Link className="row-t" href={href(p)}>
                      {p.text}
                    </Link>
                    <div className="sub">
                      <span className="cid">{caseRef(p.case_id)}</span>
                      <span>{firstName(p.person)}</span>
                      <span>{STATUS_LABEL[p.status]}</span>
                    </div>
                  </div>
                  <span className="late-chip">
                    due {fmtShort(p.due!)} · {age(-diffDays(p.due!, today))} late
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty">Nothing is past due.</p>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel-h">
          <h2>Workload by person</h2>
          <div className="legend">
            {OPEN.map((s) => (
              <span key={s} className={`st-${s}`}>
                <i />
                {s === "done" ? "Done, needs approval" : STATUS_LABEL[s]}
              </span>
            ))}
          </div>
        </div>
        <div className="load">
          {rows.map((r) => {
            const total = r.todo + r.progress + r.wait + r.done;
            return (
              <div className="load-r" key={r.id}>
                <span className="load-who">
                  <Avatar name={r.name} lead={r.role === "lead"} size="sm" />
                  <span>{firstName(r.name)}</span>
                </span>
                <span className="load-bar" role="img" aria-label={`${r.name}: ${r.todo} to do, ${r.progress} in progress, ${r.wait} waiting, ${r.done} done and needing approval`}>
                  {OPEN.map((s) =>
                    r[s] ? (
                      <i key={s} className={`st-${s}`} style={{ width: `${(r[s] / maxLoad) * 100}%` }} title={`${STATUS_LABEL[s]}: ${r[s]}`}>
                        {r[s] / maxLoad > 0.06 ? r[s] : ""}
                      </i>
                    ) : null,
                  )}
                  {!total && <span className="load-none">No open points</span>}
                </span>
                <span className="load-n">
                  <b>{total}</b>
                  {r.late > 0 && <span className="late-chip sm">{r.late} late</span>}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid2 even">
        <section className="panel">
          <div className="panel-h">
            <h2>Work coming in and getting done</h2>
            <div className="legend">
              <span className="k-added">
                <i />
                Points added
              </span>
              <span className="k-done">
                <i />
                Points done
              </span>
            </div>
          </div>
          <div className="weeks" role="img" aria-label="Points added and done per week, last 8 weeks">
            {weeks.map((w) => (
              <div className="week" key={w.week} title={`Week of ${fmtShort(w.week)}: ${w.added} added, ${w.done} done, ${w.approved} approved`}>
                <div className="week-bars">
                  <span className="wb k-added" style={{ height: `${(w.added / maxWeek) * 100}%` }}>
                    {w.added > 0 && <b>{w.added}</b>}
                  </span>
                  <span className="wb k-done" style={{ height: `${(w.done / maxWeek) * 100}%` }}>
                    {w.done > 0 && <b>{w.done}</b>}
                  </span>
                </div>
                <span className="week-l">{fmtShort(w.week)}</span>
              </div>
            ))}
          </div>
          <p className="hint dash-note">Each pair is one week, starting on the date shown. When "added" stays above "done", work is piling up.</p>
        </section>

        <section className="panel">
          <div className="panel-h">
            <h2>
              Blocked: waiting on someone <span className="count">{waiting.length}</span>
            </h2>
          </div>
          {waiting.length ? (
            <div className="rows scroll">
              {waiting.map((p) => (
                <div className="row" key={p.id}>
                  <Avatar name={p.person} />
                  <div className="row-main">
                    <Link className="row-t" href={href(p)}>
                      {p.wait_reason || "No reason given"}
                    </Link>
                    <div className="sub">
                      <span className="cid">{caseRef(p.case_id)}</span>
                      <span className="trunc">{p.text}</span>
                    </div>
                  </div>
                  <span className={`small ${daysSince(p.status_at) >= 3 ? "warn-t" : "muted"}`}>{age(daysSince(p.status_at))}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty">Nothing is blocked.</p>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel-h">
          <h2>Each person</h2>
          <span className="hint">On time and finished count the last 30 days</span>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Person</th>
                <th className="num">Cases</th>
                <th className="num">Open points</th>
                <th className="num">Past due</th>
                <th className="num">Needs approval</th>
                <th className="num">Finished</th>
                <th className="num">On time</th>
                <th>Last signed in</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="tbl-who">
                      <Avatar name={r.name} lead={r.role === "lead"} size="xs" />
                      {r.name}
                      {r.role === "lead" && <span className="tag-st lead">Lead</span>}
                    </span>
                  </td>
                  <td className="num">{r.cases}</td>
                  <td className="num">{r.openN}</td>
                  <td className={`num${r.late ? " bad-t" : ""}`}>{r.late || "–"}</td>
                  <td className="num">{r.done || "–"}</td>
                  <td className="num">{r.closed30 || "–"}</td>
                  <td className="num">{r.onTime === null ? "–" : `${r.onTime}%`}</td>
                  <td className="muted">{r.last_login_at ? (daysSince(r.last_login_at) === 0 ? "Today" : `${age(daysSince(r.last_login_at))} ago`) : "Never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid2 even">
        <section className="panel">
          <div className="panel-h">
            <h2>Quietest open cases</h2>
            <span className="hint">Longest without any activity</span>
          </div>
          {quiet.length ? (
            <div className="rows">
              {quiet.map((c) => (
                <Link className="row nolead" key={c.id} href={`/cases/${c.id}`}>
                  <div className="row-main">
                    <span className="row-t">{c.subject}</span>
                    <div className="sub">
                      <span className="cid">{caseRef(c.id)}</span>
                      <span>{firstName(c.owner)}</span>
                      <span>{plural(c.open, "open point")}</span>
                    </div>
                  </div>
                  <span className={`small ${daysSince(c.last_at) >= 3 ? "warn-t" : "muted"}`}>{daysSince(c.last_at) === 0 ? "active today" : `quiet ${age(daysSince(c.last_at))}`}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="empty">No open cases.</p>
          )}
        </section>

        <section className="panel">
          <div className="panel-h">
            <h2>Open points by company</h2>
          </div>
          {companies.length ? (
            <div className="load co">
              {companies.map(([name, n]) => (
                <div className="load-r" key={name}>
                  <span className="load-who">
                    <span className="trunc">{name}</span>
                  </span>
                  <span className="load-bar">
                    <i className="k-added" style={{ width: `${(n / maxCo) * 100}%` }} title={`${name}: ${n} open points`} />
                  </span>
                  <span className="load-n">
                    <b>{n}</b>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty">No open points.</p>
          )}
        </section>
      </div>
    </div>
  );
}
