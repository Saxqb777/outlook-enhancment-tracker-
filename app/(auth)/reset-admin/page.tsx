import type { Metadata } from "next";
import Link from "next/link";
import AuthCard from "@/components/AuthCard";
import { AdminResetForm } from "@/components/forms";

export const metadata: Metadata = { title: "Reset the Admin password" };
export const dynamic = "force-dynamic";

export default function AdminResetPage() {
  return (
    <AuthCard title="Reset the Admin password" lede="For the Admin only. You need the setup code that was set when the app was installed. Leads and Members: ask your Lead or the Admin for a reset link instead.">
      <AdminResetForm />
      <p className="auth-note">
        <Link href="/login">Back to sign in</Link>
      </p>
    </AuthCard>
  );
}
