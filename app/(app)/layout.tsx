import { stopViewAs } from "@/app/actions/admin";
import { AttachProvider } from "@/components/Attach";
import BottomNav from "@/components/BottomNav";
import { Icon } from "@/components/Icon";
import TopBar from "@/components/TopBar";
import WhatsNew from "@/components/WhatsNew";
import { Toasts, ViewOnlyProvider } from "@/components/work";
import { getViewer } from "@/lib/auth";
import { one } from "@/lib/db";
import { NEWS_VERSION, newsFor } from "@/lib/news";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { me, real, viewOnly, viewingAs } = await getViewer();
  const navRole = viewingAs ? viewingAs.role : real.role;
  const scope = me.role === "member" ? me.id : null;
  const counts = await one<{ review: number; unread: number }>(
    `select (select count(*)::int from points where status = 'done') as review,
            (select count(*)::int from case_messages m join cases c on c.id = m.case_id
              where m.user_id is distinct from $2
                and ($1::uuid is null or c.owner_id = $1 or exists (select 1 from case_members cm where cm.case_id = c.id and cm.user_id = $1))
                and ($1::uuid is not null or c.owner_id = $2 or exists (select 1 from case_members cm where cm.case_id = c.id and cm.user_id = $2))
                and m.created_at > coalesce((select r.last_read_at from case_reads r where r.case_id = c.id and r.user_id = $2), c.created_at)) as unread`,
    [scope, me.id],
  );
  const badges = { review: me.role === "lead" ? (counts?.review ?? 0) : 0, unread: counts?.unread ?? 0 };
  return (
    <ViewOnlyProvider value={viewOnly}>
      <AttachProvider local={!process.env.BLOB_READ_WRITE_TOKEN}>
      <TopBar me={{ name: real.name, email: real.email, role: real.role }} navRole={navRole} viewOnly={viewOnly} badges={badges} />
      {viewingAs && (
        <div className="viewas" role="status">
          <Icon name="eye" size={16} />
          <span>
            Viewing as <b>{viewingAs.name}</b> ({viewingAs.role === "lead" ? "Lead" : "Member"}) · view only
          </span>
          <span className="sp" />
          <form action={stopViewAs}>
            <button className="btn btn-sm" type="submit">
              <Icon name="back" size={14} />
              Back to Admin
            </button>
          </form>
        </div>
      )}
      <main className="page" id="main" data-viewer={me.id === real.id ? undefined : "as"}>
        {children}
      </main>
      <BottomNav role={navRole} viewOnly={viewOnly} badges={badges} />
      <Toasts />
      {(real.seen_news ?? 0) < NEWS_VERSION && <WhatsNew items={newsFor(real.role)} version={NEWS_VERSION} />}
      </AttachProvider>
    </ViewOnlyProvider>
  );
}
