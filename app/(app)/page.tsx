import Link from "next/link";
import { Greeting, Today } from "@/components/forms";
import { Avatar, Icon } from "@/components/Icon";
import { firstName, Glyph, Pill, plural, SegBar } from "@/components/ui";
import { Clip, DueControl, ReviewButtons, StatusControl } from "@/components/work";
import { requireUser, type User } from "@/lib/auth";
import { one } from "@/lib/db";
import { caseRef, closedStatus } from "@/lib/status";
import { diffDays, fmtDay, fmtWhen, todayISO } from "@/lib/time";
import { leadName, listCases, listPoints, recentActivity, recentRemarks, type ActivityRow, type BoardPoint } from "@/lib/work";

export const dynamic = "force-dynamic";

const href = (p: { case_id: string; id: string }) => `/cases/${p.case_id}#pt-${p.id}`;
const isLate = (p: BoardPoint, today: string) => !closedStatus(p.status) && !!p.due && diffDays(p.due, today) < 0;
const byDue = (a: BoardPoint, b: BoardPoint) => (a.due ?? "9999").localeCompare(b.due ?? "9999");

export default async function HomePage() {
  const me = await requireUser();
  return me.role === "lead" ? <LeadHome me={me} /> : <MemberHome me={me} />;
}

function PointRow({ p, lead, actions, extra }: { p: BoardPoint; lead: boolean; actions: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className={`row${lead ? "" : " nolead"}`}>
      {lead && <Avatar name={p.owner_name} lead={p.owner_lead} />}
      <div className="row-main">
        <Link className="row-t" href={href(p)}>
          {p.text}
        </Link>
        <div className="sub">
          <span className="cid">{caseRef(p.case_id)}</span>
          <span className="trunc">{p.subject}</span>
        </div>
        {extra}
      </div>
      <div className="row-act">{actions}</div>
    </div>
  );
}

function ActivityLine({ e }: { e: ActivityRow }) {
  const who = <b>{firstName(e.user_name)}</b>;
  const a = <Link href={`/cases/${e.case_id}#pt-${e.point_id}`}>{e.point_text}</Link>;
  switch (e.kind) {
    case "update":
      return (
        <>
          {who} posted an update on {a}
        </>
      );
    case "remark":
      return (
        <>
          {who} added a remark on {a}
        </>
      );
    case "status":
      return e.status === "approved" ? (
        <>
          {who} approved {a}
        </>
      ) : (
        <>
          {who} moved {a} to {e.status ? <Pill s={e.status} /> : "a new status"}
        </>
      );
    case "reopen":
      return (
        <>
          {who} reopened {a}
        </>
      );
    case "due":
      return e.due ? (
        <>
          {who} set {a} due {fmtDay(e.due)}
        </>
      ) : (
        <>
          {who} removed the deadline on {a}
        </>
      );
    default:
      return (
        <>
          {who} added {a}
        </>
      );
  }
}

function Activity({ rows, today }: { rows: ActivityRow[]; today: string }) {
  return (
    <section className="panel">
      <div className="panel-h">
        <h2>Recent activity</h2>
      </div>
      {rows.length ? (
        <Clip count={rows.length} kind="acts">
          {rows.map((e) => (
            <li className="act" key={e.id}>
              <Avatar name={e.user_name ?? "?"} />
              <div>
                <div>
                  <ActivityLine e={e} />
                </div>
                {e.text && (e.kind === "update" || e.kind === "remark") && (
                  <div className="act-q">
                    {e.kind === "remark" && <span className="kind remark">Remark</span>} {e.text}
                  </div>
                )}
              </div>
              <time dateTime={new Date(e.created_at).toISOString()}>{fmtWhen(e.created_at, today)}</time>
            </li>
          ))}
        </Clip>
      ) : (
        <p className="empty">Updates, remarks and approvals show up here.</p>
      )}
    </section>
  );
}

async function LeadHome({ me }: { me: User }) {
  const today = todayISO();
  const [points, cases, activity, team] = await Promise.all([
    listPoints(me),
    listCases(me),
    recentActivity(me, 8),
    one<{ members: number; invited: number }>(
      `select count(*) filter (where status = 'active')::int as members, count(*) filter (where status = 'invited')::int as invited
         from users where role = 'member'`,
    ),
  ]);
  const members = team?.members ?? 0;
  const invited = team?.invited ?? 0;

  const open = points.filter((p) => p.status !== "approved");
  const review = points.filter((p) => p.status === "done").sort((a, b) => String(b.last_at).localeCompare(String(a.last_at)));
  const late = open.filter((p) => isLate(p, today)).sort(byDue);
  const soon = open.filter((p) => p.status !== "done" && !isLate(p, today) && p.due && diffDays(p.due, today) <= 2).sort(byDue);
  const comingUp = [...late, ...soon];
  const openCases = cases.filter((c) => !(c.points.length && c.points.every((p) => p.status === "approved")));
  const reviewers = new Set(review.map((p) => p.owner_id)).size;

  if (!cases.length) {
    const hasTeam = members + invited > 0;
    return (
      <div className="page-in">
        <header className="ph">
          <div>
            <Today />
            <h1 className="h1">
              <Greeting name={me.name} />
            </h1>
            <p className="lede">Welcome to Agthia Enhancements. Here&apos;s how to get going.</p>
          </div>
        </header>
        <section className="panel">
          <div className="panel-h">
            <h2>Getting started</h2>
          </div>
          <ol className="steps">
            <li className={hasTeam ? "done" : ""}>
              <span className="step-n">{hasTeam ? <Icon name="check" size={14} /> : "1"}</span>
              <div>
                <b>Add your team</b>
                <p>Create an invite link on the Team page. Each person opens it, adds their name and email, and picks a password.</p>
              </div>
              <Link className={`btn btn-sm${hasTeam ? "" : " btn-primary"}`} href="/team">
                {hasTeam ? "Manage team" : "Invite someone"}
              </Link>
            </li>
            <li>
              <span className="step-n">2</span>
              <div>
                <b>Add your first email</b>
                <p>Paste an email or drop the file. Each thing it asks for becomes a point you can track.</p>
              </div>
              <Link className={`btn btn-sm${hasTeam ? " btn-primary" : ""}`} href="/add">
                Add an email
              </Link>
            </li>
            <li className="soon">
              <span className="step-n">3</span>
              <div>
                <b>Follow the work</b>
                <p>Members post updates on their points. You add remarks and approve finished work.</p>
              </div>
            </li>
          </ol>
        </section>
        <Activity rows={activity} today={today} />
      </div>
    );
  }

  return (
    <div className="page-in">
      <header className="ph">
        <div>
          <Today />
          <h1 className="h1">
            <Greeting name={me.name} />
          </h1>
          <p className="lede">
            {review.length ? (
              <>
                <b>{plural(review.length, "point")}</b> {review.length === 1 ? "is" : "are"} ready for your review
              </>
            ) : (
              "Nothing is waiting for your review"
            )}
            {late.length ? (
              <>
                , and <b>{late.length} {late.length === 1 ? "is" : "are"} past due</b>.
              </>
            ) : (
              "."
            )}
          </p>
        </div>
        <div className="ph-act m-hide">
          <Link className="btn" href="/board">
            <Icon name="board" size={15} />
            Open board
          </Link>
          <Link className="btn btn-primary" href="/add">
            <Icon name="plus" size={15} />
            Add email
          </Link>
        </div>
      </header>

      <section className="stats" aria-label="Key numbers">
        <Link className="stat m-hide" href="/cases">
          <span className="lab">Open points</span>
          <span className="val">{open.length}</span>
          <span className="ctx">across {plural(openCases.length, "open case")}</span>
        </Link>
        <Link className="stat" href="/cases?show=review">
          <span className="lab" style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Glyph s="done" />
            Ready for review
          </span>
          <span className="val">{review.length}</span>
          <span className="ctx">{review.length ? `from ${plural(reviewers, "person")}`.replace("persons", "people") : "All caught up"}</span>
        </Link>
        <Link className="stat" href="/cases?show=late">
          <span className="lab" style={{ display: "flex", alignItems: "center", gap: 7 }}>
            {late.length > 0 && <i className="dot" />}
            Past due
          </span>
          <span className="val">{late.length}</span>
          <span className="ctx">{late.length ? `oldest is ${plural(-diffDays(late[0].due!, today), "day")} late` : "Everything is on time"}</span>
        </Link>
        <Link className="stat m-hide" href="/team">
          <span className="lab">Team</span>
          <span className="val">{members}</span>
          <span className="ctx">{invited ? `${invited} invite${invited === 1 ? "" : "s"} not used yet` : members === 1 ? "member has joined" : "members have joined"}</span>
        </Link>
      </section>

      <div className="grid2">
        <section className="panel">
          <div className="panel-h">
            <h2>
              Ready for your review <span className="count">{review.length}</span>
            </h2>
          </div>
          {review.length ? (
            <Clip count={review.length}>
              {review.map((p) => (
                <PointRow key={p.id} p={p} lead actions={<ReviewButtons pointId={p.id} />} extra={p.last_update ? <div className="quote">{p.last_update}</div> : null} />
              ))}
            </Clip>
          ) : (
            <p className="empty">Nothing to review. Points show up here when someone marks them done.</p>
          )}
        </section>
        <section className="panel">
          <div className="panel-h">
            <h2>
              Coming up <span className="count">{comingUp.length}</span>
            </h2>
          </div>
          {comingUp.length ? (
            <Clip count={Math.min(comingUp.length, 8)}>
              {comingUp.slice(0, 8).map((p) => (
                <PointRow
                  key={p.id}
                  p={p}
                  lead
                  actions={
                    <>
                      <StatusControl pointId={p.id} status={p.status} role="lead" leadName={firstName(me.name)} />
                      <DueControl due={p.due} status={p.status} today={today} pointId={p.id} />
                    </>
                  }
                />
              ))}
            </Clip>
          ) : (
            <p className="empty">Nothing is late or due in the next two days.</p>
          )}
          {comingUp.length > 8 && (
            <Link className="row nolead more-row" href="/board">
              <span className="row-t">{comingUp.length - 8} more on the board</span>
            </Link>
          )}
        </section>
      </div>

      <Activity rows={activity} today={today} />
    </div>
  );
}

async function MemberHome({ me }: { me: User }) {
  const today = todayISO();
  const [points, cases, remarks, lead] = await Promise.all([listPoints(me), listCases(me), recentRemarks(me, 4), leadName()]);
  const lf = firstName(lead);

  const work = points.filter((p) => p.status !== "approved" && p.status !== "done");
  const late = work.filter((p) => isLate(p, today));
  const dueToday = work.filter((p) => p.due && diffDays(p.due, today) === 0);
  const week = work.filter((p) => p.due && !isLate(p, today) && diffDays(p.due, today) <= 6);
  const withLead = points.filter((p) => p.status === "done");
  const next = [...work].sort((a, b) => Number(isLate(b, today)) - Number(isLate(a, today)) || byDue(a, b)).slice(0, 8);
  const openCases = cases.filter((c) => !(c.points.length && c.points.every((p) => p.status === "approved")));

  const parts: React.ReactNode[] = [];
  if (dueToday.length) parts.push(<b key="t">{plural(dueToday.length, "point")} due today</b>);
  if (late.length) parts.push(<b key="l">{late.length} past due</b>);

  return (
    <div className="page-in">
      <header className="ph">
        <div>
          <Today />
          <h1 className="h1">
            <Greeting name={me.name} />
          </h1>
          <p className="lede">
            {!cases.length ? (
              "You're all set up. Add an email to start tracking your work."
            ) : parts.length ? (
              <>
                You have {parts[0]}
                {parts[1] ? <> and {parts[1]}</> : null}.
              </>
            ) : (
              "Nothing is due today, and nothing is late."
            )}
          </p>
        </div>
        <div className="ph-act m-hide">
          <Link className="btn btn-primary" href="/add">
            <Icon name="plus" size={15} />
            Add email
          </Link>
        </div>
      </header>

      {!cases.length ? (
        <section className="panel">
          <div className="panel-h">
            <h2>How it works</h2>
          </div>
          <ol className="steps">
            <li>
              <span className="step-n">1</span>
              <div>
                <b>Add an email</b>
                <p>Paste an email or drop the file. Each thing it asks for becomes a point you can track.</p>
              </div>
              <Link className="btn btn-sm btn-primary" href="/add">
                Add an email
              </Link>
            </li>
            <li className="soon">
              <span className="step-n">2</span>
              <div>
                <b>Post updates as you go</b>
                <p>Move each point from To do to Done, and add a short update so {lf} knows where things stand.</p>
              </div>
            </li>
            <li className="soon">
              <span className="step-n">3</span>
              <div>
                <b>{lf} approves</b>
                <p>When you mark a point done, {lf} reviews it and approves it, or reopens it with a remark.</p>
              </div>
            </li>
          </ol>
        </section>
      ) : (
        <>
          <section className="stats" aria-label="Key numbers">
            <Link className="stat m-hide" href="/board">
              <span className="lab">Open points</span>
              <span className="val">{work.length}</span>
              <span className="ctx">across {plural(openCases.length, "case")}</span>
            </Link>
            <Link className="stat" href="/board">
              <span className="lab">Due this week</span>
              <span className="val">{week.length}</span>
              <span className="ctx">in the next 7 days</span>
            </Link>
            <Link className="stat" href="/cases?show=late">
              <span className="lab" style={{ display: "flex", alignItems: "center", gap: 7 }}>
                {late.length > 0 && <i className="dot" />}
                Past due
              </span>
              <span className="val">{late.length}</span>
              <span className="ctx">{late.length ? `oldest is ${plural(Math.max(...late.map((p) => -diffDays(p.due!, today))), "day")} late` : "You're on time"}</span>
            </Link>
            <Link className="stat m-hide" href="/cases?show=review">
              <span className="lab" style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Glyph s="done" />
                With {lf} for review
              </span>
              <span className="val">{withLead.length}</span>
              <span className="ctx">marked done</span>
            </Link>
          </section>

          <div className="grid2">
            <section className="panel">
              <div className="panel-h">
                <h2>
                  Your next steps <span className="count">{work.length}</span>
                </h2>
              </div>
              {next.length ? (
                <Clip count={next.length}>
                  {next.map((p) => (
                    <PointRow
                      key={p.id}
                      p={p}
                      lead={false}
                      actions={
                        <>
                          <StatusControl pointId={p.id} status={p.status} role="member" leadName={lf} />
                          <DueControl due={p.due} status={p.status} today={today} pointId={p.id} />
                        </>
                      }
                    />
                  ))}
                </Clip>
              ) : (
                <p className="empty">You have no open points. Add an email to start tracking new work.</p>
              )}
            </section>
            <section className="panel">
              <div className="panel-h">
                <h2>Remarks from {lf}</h2>
              </div>
              {remarks.length ? (
                <ul className="rmks">
                  {remarks.map((r) => (
                    <li className="rmk" key={r.id}>
                      <div className="rmk-h">
                        <Avatar name={r.user_name ?? lead} lead size="xs" />
                        <b>{firstName(r.user_name ?? lead)}</b>
                        <time dateTime={new Date(r.created_at).toISOString()}>{fmtWhen(r.created_at, today)}</time>
                      </div>
                      <p className="rmk-t">{r.text}</p>
                      <Link className="rmk-on" href={`/cases/${r.case_id}#pt-${r.point_id}`}>
                        <span>On: {r.point_text}</span>
                        <span className="cid">{caseRef(r.case_id)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty">No remarks yet. {lf}&apos;s notes on your points show up here.</p>
              )}
            </section>
          </div>

          <section className="panel">
            <div className="panel-h">
              <h2>
                Your open cases <span className="count">{openCases.length}</span>
              </h2>
              <Link className="btn btn-sm btn-ghost" href="/cases">
                All cases
              </Link>
            </div>
            {openCases.length ? (
              <div className="rows">
                {openCases.map((c) => {
                  const appr = c.points.filter((p) => p.status === "approved").length;
                  return (
                    <Link className="row nolead" key={c.id} href={`/cases/${c.id}`}>
                      <div className="row-main">
                        <span className="row-t">{c.subject}</span>
                        <div className="sub">
                          <span className="cid">{caseRef(c.id)}</span>
                          <span className="trunc">{c.company || c.from_name}</span>
                        </div>
                      </div>
                      <div className="row-act">
                        <SegBar statuses={c.points.map((p) => p.status)} />
                        <span className="small tnum muted">
                          {appr}/{c.points.length}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="empty">Every case is closed. Nice work.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
