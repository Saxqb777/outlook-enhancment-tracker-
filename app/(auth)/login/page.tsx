import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthCard from "@/components/AuthCard";
import { LoginForm } from "@/components/forms";
import { getCurrentUser, leadExists } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const showSetup = !(await leadExists());
  return (
    <AuthCard title="Sign in" lede="Every email your team is working on, tracked in one place.">
      <LoginForm showSetup={showSetup} />
    </AuthCard>
  );
}
