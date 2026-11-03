import BottomNav from "@/components/BottomNav";
import TopBar from "@/components/TopBar";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  return (
    <>
      <TopBar me={{ name: me.name, email: me.email, role: me.role }} />
      <main className="page" id="main">
        {children}
      </main>
      <BottomNav role={me.role} />
    </>
  );
}
