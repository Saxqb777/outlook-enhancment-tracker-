import type { Metadata } from "next";
import { viewAs } from "@/app/actions/admin";
import { Avatar, Icon } from "@/components/Icon";
import { plural } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { fmtShort, fmtWhen, todayISO } from "@/lib/time";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

type Person = {
  id: string;
  name: string;
  email: string | null;
  role: "lead" | "member";
  status: "invited" | "active" | "disabled";
  last_login_at: Date | null;
  invite_expires: Date | null;
  open_points: number;
  late_points: number;
  cases: number;
};
type AiRead = { id: string; kind: "new" | "reply"; ok: boolean; ms: number; chars: number; points: number | null; error: string | null; created_at: Date; name: string | null };
type Attempt = { id: string; email: string; ok: boolean; at: Date; paused: boolean; known: boolean };

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function ago(d: Date): string {
  const mins = Math.round((new Date(d).getTime() - Date.now()) / 60000);
  if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

export default async function AdminPage() {
  await requireAdmin();
  const today = todayISO();
  const t0 = Date.now();
  await one("select 1");
  const dbMs = Date.now() - t0;

  const [people, reads, attempts, stats, openLinks] = await Promise.all([
    q<Person>(
      `select u.id, u.name, u.email, u.role, u.status, u.last_login_at, i.expires_at as invite_expires,
              (select count(*)::int from points p join cases c on c.id = p.case_id where c.owner_id = u.id and p.status <> 'approved') as open_points,
              (select count(*)::int from points p join cases c on c.id = p.case_id
                where c.owner_id = u.id and p.status not in ('done', 'approved') and p.due < $1::date) as late_points,
              (select count(*)::int from cases c where c.owner_id = u.id) as cases
         from users u left join invites i on i.user_id = u.id
        where u.role <> 'admin'
        order by (u.role = 'lead') desc, (u.status = 'active') desc, lower(u.name)`,
      [today],
    ),
    q<AiRead>(
      `select r.id::text as id, r.kind, r.ok, r.ms, r.chars, r.points, r.error, r.created_at, u.name
         from ai_reads r left join users u on u.id = r.user_id order by r.created_at desc limit 15`,
    ),
    q<Attempt>(
      `select a.id::text as id, a.email, a.ok, a.at,
              (select count(*) from login_attempts b where lower(b.email) = lower(a.email) and b.ok = false and b.at > now() - interval '15 minutes') >= 8 as paused,
              exists (select 1 from users u where lower(u.email) = lower(a.email)) as known
         from login_attempts a order by a.at desc limit 20`,
    ),
    one<{ open_cases: number; cases: number; late: number; reads_ok: number; reads_bad: number; fails_24h: number; last_read: Date | null; emails: number; replies: number }>(
      `select (select count(*)::int from cases c where exists (select 1 from points p where p.case_id = c.id and p.status <> 'approved')) as open_cases,
              (select count(*)::int from cases) as cases,
              (select count(*)::int from points where status not in ('done', 'approved') and due < $1::date) as late,
              (select count(*)::int from ai_reads where ok and created_at > now() - interval '7 days') as reads_ok,
              (select count(*)::int from ai_reads where not ok and created_at > now() - interval '7 days') as reads_bad,
              (select count(*)::int from login_attempts where not ok and at > now() - interval '24 hours') as fails_24h,
              (select max(created_at) from ai_reads where ok) as last_read,
              (select count(*)::int from case_emails) as emails,
              (select count(*)::int from case_emails where position > 0) as replies`,
      [today],
    ),
    q<{ label: string | null; expires_at: Date }>("select label, expires_at from invites where user_id is null and expires_at > now() order by created_at desc"),
  ]);
  const s = stats!;
  const aiKey = !!process.env.ANTHROPIC_API_KEY;

  return (
    <div className="page-in">
      <header className="ph">
        <div>
          <div className="date">Admin · view only</div>
          <h1 className="h1">Everything at a glance</h1>
          <p className="lede">See every case and each person&apos;s view. Nothing here changes anyone&apos;s work.</p>
        </div>
      </header>

      <section className="stats" aria-label="Health">
        <div className="stat">
          <span className="lab" style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <i className="dot" style={{ background: "var(--s-done)" }} />
            Database
          </span>
          <span className="val">OK</span>
          <span className="ctx">answered in {dbMs} ms</span>
        </div>
        <div className="stat">
          <span className="lab" style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <i className="dot" style={{ background: aiKey && !s.reads_bad ? "var(--s-done)" : aiKey ? "var(--s-wait)" : "var(--s-late)" }} />
            AI reading
          </span>
          <span className="val">{aiKey ? `${s.reads_ok}` : "Off"}</span>
          <span className="ctx">
            {aiKey ? `read in the last 7 days${s.reads_bad ? `, ${s.reads_bad} failed` : ", none failed"}` : "The AI key isn't set on the server"}
          </span>
        </div>
        <div className="stat">
          <span className="lab" style={{ display: "flex", alignItems: "center", gap: 7 }}>
            {s.fails_24h > 0 && <i className="dot" style={{ background: "var(--s-wait)" }} />}
            Failed sign-ins
          </span>
          <span className="val">{s.fails_24h}</span>
          <span className="ctx">in the last 24 hours</span>
        </div>
        <div className="stat">
          <span className="lab">Cases</span>
          <span className="val">{s.open_cases}</span>
          <span className="ctx">
            open of {s.cases} · {plural(s.replies, "reply").replace("replys", "replies")} added{s.late ? ` · ${s.late} points past due` : ""}
          </span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2>
            People <span className="count">{people.length}</span>
          </h2>
          <span className="hint">&ldquo;See their view&rdquo; shows the app exactly as they see it, view only.</span>
        </div>
        <div className="list">
          {people.map((p) => {
            const expired = p.status === "invited" && (!p.invite_expires || new Date(p.invite_expires).getTime() < Date.now());
            return (
              <div className="prow" key={p.id}>
                <span className="t-who">
                  <Avatar name={p.name} lead={p.role === "lead"} />
                  <span>
                    <b>{p.name}</b>
                    <span className="muted small">{p.email ?? "No email yet"}</span>
                  </span>
                </span>
                <span>
                  {p.role === "lead" ? (
                    <span className="tag-st lead">Lead</span>
                  ) : p.status === "active" ? (
                    <span className="tag-st">Member</span>
                  ) : p.status === "disabled" ? (
                    <span className="tag-st off">Access off</span>
                  ) : expired ? (
                    <span className="tag-st inv late">Invite expired</span>
                  ) : (
                    <span className="tag-st inv">Invite sent</span>
                  )}
                </span>
                <span className="p-seen small muted">
                  {p.status === "invited"
                    ? expired
                      ? "Link expired"
                      : `Link works until ${fmtShort(todayISO(new Date(p.invite_expires!)))}`
                    : p.last_login_at
                      ? `Signed in ${ago(p.last_login_at)}`
                      : "Not signed in yet"}
                </span>
                <span className="p-work small">
                  {p.status === "invited" ? (
                    <span className="muted">—</span>
                  ) : (
                    <>
                      {plural(p.cases, "case")} · {p.open_points} open
                      {p.late_points > 0 && <b style={{ color: "#9f2a2a" }}> · {p.late_points} late</b>}
                    </>
                  )}
                </span>
                <span className="t-act">
                  {p.status === "active" && (
                    <form action={viewAs}>
                      <input type="hidden" name="userId" value={p.id} />
                      <button className="btn btn-sm" type="submit">
                        <Icon name="eye" size={14} />
                        See their view
                      </button>
                    </form>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        {openLinks.length > 0 && (
          <p className="hint" style={{ margin: "0 18px 14px" }}>
            {plural(openLinks.length, "invite link")} not used yet:{" "}
            {openLinks.map((o) => `${o.label ?? "no note"} (until ${fmtShort(todayISO(new Date(o.expires_at)))})`).join(", ")}.
          </p>
        )}
      </section>

      <div className="adm-grid">
        <section className="panel">
          <div className="panel-h">
            <h2>AI reading log</h2>
            <span className="hint">{s.last_read ? `Last worked ${ago(s.last_read)}` : "Nothing read yet"}</span>
          </div>
          {reads.length ? (
            <ul className="logs">
              {reads.map((r) => (
                <li className="log" key={r.id}>
                  <Icon name={r.ok ? "check" : "x"} size={16} className={r.ok ? "ok-i" : "bad-i"} />
                  <span>
                    <b>{r.name ?? "Someone"}</b> {r.kind === "reply" ? "added a reply" : "added an email"} ·{" "}
                    {r.ok
                      ? `${r.kind === "reply" ? plural(r.points ?? 0, "change") : plural(r.points ?? 0, "point")} found in ${Math.round(r.ms / 100) / 10}s`
                      : `failed after ${Math.round(r.ms / 100) / 10}s`}
                    <span className="muted"> · {Math.round(r.chars / 5).toLocaleString()} words</span>
                    {!r.ok && r.error && <span className="err-t">{r.error}</span>}
                  </span>
                  <time dateTime={new Date(r.created_at).toISOString()}>{fmtWhen(r.created_at, today)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">Every time someone adds an email or a reply, it shows here: whether it worked, how long it took, and the error if it failed.</p>
          )}
        </section>

        <section className="panel">
          <div className="panel-h">
            <h2>Sign-ins</h2>
            <span className="hint">Last 20 tries. 8 wrong passwords in 15 minutes pauses that email.</span>
          </div>
          {attempts.length ? (
            <ul className="logs">
              {attempts.map((a) => (
                <li className="log" key={a.id}>
                  <Icon name={a.ok ? "check" : "x"} size={16} className={a.ok ? "ok-i" : "bad-i"} />
                  <span>
                    <b>{a.email}</b> · {a.ok ? "signed in" : a.known ? "wrong password" : "no account with this email"}
                    {a.paused && <span className="err-t">Paused for 15 minutes after too many tries</span>}
                  </span>
                  <time dateTime={new Date(a.at).toISOString()}>{fmtWhen(a.at, today)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">No sign-ins yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
