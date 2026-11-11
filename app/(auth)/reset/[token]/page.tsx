import type { Metadata } from "next";
import Link from "next/link";
import AuthCard from "@/components/AuthCard";
import { ResetForm } from "@/components/forms";
import { hashToken } from "@/lib/auth";
import { one } from "@/lib/db";

export const metadata: Metadata = { title: "Set a new password" };
export const dynamic = "force-dynamic";

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = /^[A-Za-z0-9_-]{20,100}$/.test(token)
    ? await one<{ name: string }>(
        "select u.name from password_resets r join users u on u.id = r.user_id where r.token_hash = $1 and r.expires_at > now() and u.status = 'active'",
        [hashToken(token)],
      )
    : null;
  if (!row) {
    return (
      <AuthCard title="This link doesn't work any more" lede="Reset links work once and expire after 24 hours. Ask your Lead for a new one.">
        <Link className="btn btn-block" href="/login">
          Go to sign in
        </Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={`Hi ${row.name.split(/\s+/)[0]}, set a new password`} lede="Choose a new password. You'll be signed in straight away, and signed out everywhere else.">
      <ResetForm token={token} />
    </AuthCard>
  );
}
