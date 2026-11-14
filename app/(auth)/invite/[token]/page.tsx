import type { Metadata } from "next";
import Link from "next/link";
import AuthCard from "@/components/AuthCard";
import { AcceptInviteForm } from "@/components/forms";
import { hashToken } from "@/lib/auth";
import { one } from "@/lib/db";

export const metadata: Metadata = { title: "Join the team" };
export const dynamic = "force-dynamic";

type Invite = { name: string | null; email: string | null; role: "lead" | "member" | "admin"; inviter: string | null };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = /^[A-Za-z0-9_-]{20,100}$/.test(token)
    ? await one<Invite>(
        `select u.name, u.email, coalesce(u.role, i.role) as role, cb.name as inviter
           from invites i
           left join users u on u.id = i.user_id
           left join users cb on cb.id = i.created_by
          where i.token_hash = $1 and i.expires_at > now() and (i.user_id is null or u.status = 'invited')`,
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

  const first = invite.name?.split(/\s+/)[0];
  const lead = invite.role === "lead";
  return (
    <AuthCard
      title={first ? `Welcome, ${first}` : "Join Shipping Tickets"}
      lede={
        <>
          {invite.inviter ? `${invite.inviter} invited you. ` : ""}
          {invite.role === "admin"
            ? "You're joining as Admin: view only. You'll see every case, the board, the team and each person's view, and nothing you do changes their work."
            : lead
              ? "You're joining as the Lead: you'll see every case, add members and approve finished work."
              : "You're joining as a Member: you'll see the cases assigned to you."}{" "}
          Add your details and choose a password.
        </>
      }
    >
      <AcceptInviteForm token={token} name={invite.name ?? ""} email={invite.email ?? ""} />
    </AuthCard>
  );
}
