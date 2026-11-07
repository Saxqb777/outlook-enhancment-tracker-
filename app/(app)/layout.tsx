import { stopViewAs } from "@/app/actions/admin";
import BottomNav from "@/components/BottomNav";
import { Icon } from "@/components/Icon";
import TopBar from "@/components/TopBar";
import { Toasts, ViewOnlyProvider } from "@/components/work";
import { getViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { me, real, viewOnly, viewingAs } = await getViewer();
  const navRole = viewingAs ? viewingAs.role : real.role;
  return (
    <ViewOnlyProvider value={viewOnly}>
      <TopBar me={{ name: real.name, email: real.email, role: real.role }} navRole={navRole} viewOnly={viewOnly} />
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
      <BottomNav role={navRole} viewOnly={viewOnly} />
      <Toasts />
    </ViewOnlyProvider>
  );
}
