import { getCurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { q } from "@/lib/db";
import { todayISO } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Tables in the backup, and the columns left out of each (passwords, link tokens, signatures of sessions). */
const TABLES: [string, string[]][] = [
  ["users", ["password_hash"]],
  ["cases", []],
  ["case_members", []],
  ["case_emails", []],
  ["points", []],
  ["point_events", []],
  ["attachments", []],
  ["case_messages", []],
  ["chat_files", []],
  ["approvals", []],
  ["approval_signers", []],
  ["approval_files", []],
  ["approval_events", []],
  ["vendors", ["invite_hash"]],
  ["vendor_users", ["password_hash"]],
  ["rfq_templates", []],
  ["milestone_templates", []],
  ["rfqs", []],
  ["rfq_vendors", []],
  ["rfq_quotes", []],
  ["rfq_messages", []],
  ["rfq_files", []],
  ["job_milestones", []],
  ["job_comments", []],
  ["activity_log", []],
];

/** Admin only: one JSON file with the app's records, for safekeeping. Attached files themselves are not included. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  if (user.role !== "admin") return new Response("Admin only.", { status: 403 });
  const out: Record<string, unknown> = { app: "Shipping Tickets", made_at: new Date().toISOString(), note: "Passwords, sign-in sessions, link tokens and attached file contents are not included." };
  for (const [table, skip] of TABLES) {
    const rows = await q(`select * from ${table} order by 1`);
    out[table] = skip.length ? rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !skip.includes(k)))) : rows;
  }
  await logActivity({ userId: user.id }, "backup", "Downloaded a backup file");
  return new Response(JSON.stringify(out), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="shipping-tickets-backup-${todayISO()}.json"`, "Cache-Control": "private, no-store" },
  });
}
