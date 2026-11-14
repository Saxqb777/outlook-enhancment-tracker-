import Link from "next/link";
import { redirect } from "next/navigation";
import { stopViewVendor } from "@/app/actions/admin";
import { portalLogout } from "@/app/actions/portal";
import { AttachProvider } from "@/components/Attach";
import { Icon, Logo } from "@/components/Icon";
import { PortalNotifier } from "@/components/Portal";
import { Toasts } from "@/components/work";
import Shortcuts from "@/components/Shortcuts";
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
            Shipping Tickets <span>Vendor portal</span>
          </span>
        </Link>
        <div className="top-r">
          <Link className="portal-who" href="/portal/account" title="My account: change password">
            <b>{v.vendor}</b>
            <span>{v.name}</span>
          </Link>
          {!v.admin && (
            <form action={portalLogout}>
              <button className="btn btn-sm" type="submit">
                <Icon name="logout" size={15} />
                <span className="m-hide">Sign out</span>
              </button>
            </form>
          )}
        </div>
      </header>
      {v.admin && (
        <div className="viewas" role="status">
          <Icon name="eye" size={16} />
          <span>
            Viewing the portal as <b>{v.vendor}</b> · {v.viewOnly ? "view only" : "sandbox, you can try everything"}
          </span>
          <span className="sp" />
          <form action={stopViewVendor}>
            <button className="btn btn-sm" type="submit">
              <Icon name="back" size={14} />
              Back to Admin
            </button>
          </form>
        </div>
      )}
      <main className="page portal-page" id="main">
        {children}
      </main>
      <Toasts />
      <Shortcuts portal />
      {!v.admin && <PortalNotifier />}
    </AttachProvider>
  );
}
