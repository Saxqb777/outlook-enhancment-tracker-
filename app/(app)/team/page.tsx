import type { Metadata } from "next";
import { cancelInvite, cancelOpenInvite, setMemberAccess } from "@/app/actions/team";
import { ConfirmButton, InviteLinkForm, NewLinkButton } from "@/components/forms";
import { Avatar } from "@/components/Icon";
import { requireLead } from "@/lib/auth";
import { q } from "@/lib/db";

export const metadata: Metadata = { title: "Team" };
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
};

type OpenInvite = { key: string; label: string | null; created_at: Date; expires_at: Date };

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function ago(d: Date): string {
  const mins = Math.round((d.getTime() - Date.now()) / 60000);
  if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}
const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dubai" });

export default async function TeamPage() {
  const me = await requireLead();
  const [people, open] = await Promise.all([
    q<Person>(
      `select u.id, u.name, u.email, u.role, u.status, u.last_login_at, i.expires_at as invite_expires,
              (select count(*)::int from points p join cases c on c.id = p.case_id where c.owner_id = u.id and p.status <> 'approved') as open_points
         from users u left join invites i on i.user_id = u.id
        order by (u.role = 'lead') desc, (u.status = 'invited') desc, lower(u.name)`,
    ),
    q<OpenInvite>("select token_hash as key, label, created_at, expires_at from invites where user_id is null and expires_at > now() order by created_at desc"),
  ]);
  const members = people.filter((p) => p.role === "member");

  return (
    <div className="page-in">
      <header className="ph">
        <div>
          <h1 className="h1">Team</h1>
          <p className="lede opt">Members see only their own cases. You see everything, and only you can approve points.</p>
        </div>
      </header>

      <section className="panel">
        <div className="panel-h">
          <h2>Invite someone</h2>
          <span className="hint">Create a link, send it to them, and they set up their own account.</span>
        </div>
        <InviteLinkForm />
        {open.length > 0 && (
          <div className="open-inv">
            <div className="open-inv-h">Links not used yet</div>
            {open.map((o) => (
              <div className="open-inv-r" key={o.key}>
                <span>
                  <b>{o.label ?? "Invite link"}</b>
                  <span className="muted small">
                    Created {day(o.created_at)} · works until {day(o.expires_at)}
                  </span>
                </span>
                <ConfirmButton action={cancelOpenInvite} userId="" extra={{ key: o.key }} label="Cancel link" confirm="Stop this link working?" danger />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel" aria-label="People">
        <div className="panel-h">
          <h2>
            People <span className="count">{people.length}</span>
          </h2>
        </div>
        <div className="list">
          {people.map((p) => {
            const you = p.id === me.id;
            const expired = p.status === "invited" && (!p.invite_expires || p.invite_expires.getTime() < Date.now());
            return (
              <div className={`trow st-${p.status}`} key={p.id}>
                <span className="t-who">
                  <Avatar name={p.name} lead={p.role === "lead"} />
                  <span>
                    <b>
                      {p.name}
                      {you && <span className="you"> (you)</span>}
                    </b>
                    <span className="muted small">{p.email ?? "Adds their email when they join"}</span>
                  </span>
                </span>
                <span className="t-st">
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
                <span className="t-seen small muted">
                  {p.status === "invited"
                    ? expired
                      ? "Make a new link to invite them again"
                      : `Link works until ${day(p.invite_expires!)}`
                    : `${p.open_points} open point${p.open_points === 1 ? "" : "s"} · ${p.last_login_at ? `signed in ${ago(p.last_login_at)}` : "not signed in yet"}`}
                </span>
                <span className="t-act">
                  {p.role === "member" && p.status === "invited" && (
                    <>
                      <NewLinkButton userId={p.id} />
                      <ConfirmButton action={cancelInvite} userId={p.id} label="Cancel invite" confirm="Remove this invite?" danger />
                    </>
                  )}
                  {p.role === "member" && p.status === "active" && (
                    <ConfirmButton
                      action={setMemberAccess}
                      userId={p.id}
                      label="Turn off access"
                      confirm="They'll be signed out right away."
                      extra={{ access: "off" }}
                      danger
                    />
                  )}
                  {p.role === "member" && p.status === "disabled" && (
                    <ConfirmButton action={setMemberAccess} userId={p.id} label="Turn access on" confirm="Let them sign in again?" extra={{ access: "on" }} />
                  )}
                </span>
              </div>
            );
          })}
          {!members.length && <p className="empty">No members yet. Create an invite link above.</p>}
        </div>
      </section>
    </div>
  );
}
