import { getCurrentUser } from "@/lib/auth";
import { one } from "@/lib/db";

export const dynamic = "force-dynamic";

/** The original email file kept on a case. Only people who can see the case can open it. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) return new Response("Not found.", { status: 404 });
  const f = await one<{ name: string; mime: string; data: Buffer }>(
    `select f.name, f.mime, f.data
       from email_files f join case_emails e on e.id = f.email_id join cases c on c.id = e.case_id
      where f.email_id = $1 and ($2::uuid is null or c.owner_id = $2 or exists (select 1 from case_members cm where cm.case_id = c.id and cm.user_id = $2))`,
    [id, user.role === "member" ? user.id : null],
  );
  if (!f) return new Response("Not found.", { status: 404 });
  const inline = f.mime === "application/pdf" && !new URL(req.url).searchParams.has("download");
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": f.mime,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
