import type { Metadata } from "next";
import Link from "next/link";
import AuthCard from "@/components/AuthCard";
import { VendorJoinForm } from "@/components/forms";
import { hashToken } from "@/lib/auth";
import { one } from "@/lib/db";

export const metadata: Metadata = { title: "Vendor portal" };
export const dynamic = "force-dynamic";

export default async function VendorJoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const vendor = /^[A-Za-z0-9_-]{20,100}$/.test(token) ? await one<{ name: string }>("select name from vendors where invite_hash = $1 and invite_expires > now() and status = 'active'", [hashToken(token)]) : null;
  if (!vendor) {
    return (
      <AuthCard title="This link doesn't work any more" lede="Join links expire after 14 days. Ask your contact at Agthia to send a new one.">
        <Link className="btn btn-block" href="/login">
          Go to sign in
        </Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={`Welcome, ${vendor.name}`} lede="Agthia will send you transport requests here. You reply with your price or say you can't do it, and chat with them about each request. Make your login to start.">
      <VendorJoinForm token={token} />
    </AuthCard>
  );
}
