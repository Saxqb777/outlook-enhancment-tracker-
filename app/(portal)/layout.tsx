import Link from "next/link";
import { redirect } from "next/navigation";
import { portalLogout } from "@/app/actions/portal";
import { AttachProvider } from "@/components/Attach";
import { Icon, Logo } from "@/components/Icon";
import { PortalNotifier } from "@/components/Portal";
import { Toasts } from "@/components/work";
import { getCurrentUser } from "@/lib/auth";
import { getVendorUser } from "@/lib/vendor-auth";

export const dynamic = "force-dynamic";

/** The vendor portal: its own simple shell. Vendors never see the team's app. */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const v = await getVendorUser();
  if (!v) redirect((await getCurrentUser()) ? "/vendors" : "/login");
  return (
    <AttachProvider local={!process.env.BLOB_READ_WRITE_TOKEN}>
      <header className="top portal-top">
        <Link className="brand" href="/portal" aria-label="Vendor portal home">
          <Logo />
          <span className="brand-t">
            Agthia <span>Vendor portal</span>
          </span>
        </Link>
        <div className="top-r">
          <span className="portal-who">
            <b>{v.vendor}</b>
            <span>{v.name}</span>
          </span>
          <form action={portalLogout}>
            <button className="btn btn-sm" type="submit">
              <Icon name="logout" size={15} />
              <span className="m-hide">Sign out</span>
            </button>
          </form>
        </div>
      </header>
      <main className="page portal-page" id="main">
        {children}
      </main>
      <Toasts />
      <PortalNotifier />
    </AttachProvider>
  );
}
