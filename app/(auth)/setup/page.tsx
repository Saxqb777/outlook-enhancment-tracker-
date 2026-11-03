import type { Metadata } from "next";
import Link from "next/link";
import AuthCard from "@/components/AuthCard";
import { SetupForm } from "@/components/forms";
import { leadExists } from "@/lib/auth";

export const metadata: Metadata = { title: "Set up" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await leadExists()) {
    return (
      <AuthCard title="Already set up" lede="The Lead account exists. Sign in to continue.">
        <Link className="btn btn-primary btn-block" href="/login">
          Go to sign in
        </Link>
      </AuthCard>
    );
  }
  if (!process.env.SETUP_CODE) {
    return <AuthCard title="Setup is turned off" lede="Add a SETUP_CODE to the server settings, then reload this page." />;
  }
  return (
    <AuthCard
      title="Create the Lead account"
      lede="The Lead sees every case, adds members and approves their work. You only do this once."
    >
      <SetupForm />
    </AuthCard>
  );
}
