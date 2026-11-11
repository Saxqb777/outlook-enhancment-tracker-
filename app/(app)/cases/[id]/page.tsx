import type { Metadata } from "next";
import Link from "next/link";
import CaseView from "@/components/CaseView";
import { getViewer } from "@/lib/auth";
import { one } from "@/lib/db";
import { caseRef } from "@/lib/status";
import { todayISO } from "@/lib/time";
import { assignees, getCase, leadName } from "@/lib/work";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ email?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: /^\d{1,12}$/.test(id) ? caseRef(id) : "Case" };
}

export default async function CasePage({ params, searchParams }: Props) {
  const { me } = await getViewer();
  const { id } = await params;
  const { email } = await searchParams;
  const [c, lead, people] = await Promise.all([getCase(me, id), leadName(), assignees()]);

  if (!c) {
    return (
      <div className="page-in">
        <header className="ph">
          <div>
            <h1 className="h1">This case isn&apos;t available</h1>
            <p className="lede">
              {me.role === "member" ? "It may belong to someone else. Members only see their own cases." : "The link may be wrong, or the case was removed."}
            </p>
          </div>
        </header>
        <Link className="btn" href="/cases" style={{ alignSelf: "flex-start" }}>
          Go to cases
        </Link>
      </div>
    );
  }

  const iso = (d: Date) => new Date(d).toISOString();
  const data = {
    ...c,
    created_at: iso(c.created_at),
    emails: c.emails.map((e) => ({ ...e, created_at: iso(e.created_at) })),
    members: c.members.map((m) => ({ ...m, added_at: iso(m.added_at) })),
    points: c.points.map((p) => ({ ...p, events: p.events.map((e) => ({ ...e, created_at: iso(e.created_at) })) })),
  };
  const start = email && /^\d{1,4}$/.test(email) ? Number(email) : null;
  const canManage = me.role === "lead" || c.owner_id === me.id;
  const unread =
    (
      await one<{ n: number }>(
        `select count(*)::int as n from case_messages m where m.case_id = $1 and m.user_id is distinct from $2
            and m.created_at > coalesce((select r.last_read_at from case_reads r where r.case_id = $1 and r.user_id = $2), 'epoch')`,
        [c.id, me.id],
      )
    )?.n ?? 0;
  return (
    <CaseView
      c={data}
      role={me.role === "member" ? "member" : "lead"}
      leadName={lead}
      today={todayISO()}
      startEmail={start}
      unread={unread}
      people={people}
      canManage={canManage}
    />
  );
}
