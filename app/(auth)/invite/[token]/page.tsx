import type { Metadata } from "next";
import Link from "next/link";
import AuthCard from "@/components/AuthCard";
import { AcceptInviteForm } from "@/components/forms";
import { hashToken } from "@/lib/auth";
import { one } from "@/lib/db";

export const metadata: Metadata = { title: "Join the team" };
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = /^[A-Za-z0-9_-]{20,100}$/.test(token)
    ? await one<{ name: string; email: string; lead: string | null }>(
        `select u.name, u.email, (select name from users where role = 'lead') as lead
           from invites i join users u on u.id = i.user_id
          where i.token_hash = $1 and i.expires_at > now() and u.status = 'invited'`,
        [hashToken(token)],
      )
    : null;

  if (!invite) {
    return (
      <AuthCard
        title="This link doesn't work any more"
        lede="Invite links work once and expire after 7 days. Ask your Lead to send you a new one."
      >
        <Link className="btn btn-block" href="/login">
          Go to sign in
        </Link>
      </AuthCard>
    );
  }

  const first = invite.name.split(/\s+/)[0];
  return (
    <AuthCard
      title={`Welcome, ${first}`}
      lede={
        <>
          {invite.lead ? `${invite.lead} invited you` : "You've been invited"} to Agthia Enhancements. Choose a password to finish
          setting up <b>{invite.email}</b>.
        </>
      }
    >
      <AcceptInviteForm token={token} email={invite.email} />
    </AuthCard>
  );
}
