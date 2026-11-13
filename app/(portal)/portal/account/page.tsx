import type { Metadata } from "next";
import Link from "next/link";
import { ChangePasswordForm } from "@/components/forms";
import { Icon } from "@/components/Icon";
import { requireVendor } from "@/lib/vendor-auth";

export const metadata: Metadata = { title: "My account" };
export const dynamic = "force-dynamic";

export default async function PortalAccountPage() {
  const v = await requireVendor();
  return (
    <div className="page-in ap-narrow">
      <Link className="back" href="/portal">
        <Icon name="back" size={15} />
        All requests
      </Link>
      <header className="ph">
        <div>
          <h1 className="h1">My account</h1>
          <p className="lede">
            {v.name} · {v.email} · {v.vendor}
          </p>
        </div>
      </header>
      <section className="panel ap-new" aria-label="Change password">
        <h2 className="acc-h">Change my password</h2>
        {v.admin ? <p className="hint">You are looking at this portal as Admin.</p> : <ChangePasswordForm vendor />}
        <p className="hint">Forgot it later? Ask your contact at Agthia for a reset link.</p>
      </section>
    </div>
  );
}
