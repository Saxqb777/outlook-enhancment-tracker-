import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/forms";
import { getViewer } from "@/lib/auth";

export const metadata: Metadata = { title: "My account" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { real } = await getViewer();
  return (
    <div className="page-in ap-narrow">
      <header className="ph">
        <div>
          <h1 className="h1">My account</h1>
          <p className="lede">
            {real.name} · {real.email}
          </p>
        </div>
      </header>
      <section className="panel ap-new" aria-label="Change password">
        <h2 className="acc-h">Change my password</h2>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
