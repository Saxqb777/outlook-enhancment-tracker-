import { isImage } from "@/lib/attach-rules";
import { openAttachment } from "@/lib/attachments";
import { getCurrentUser } from "@/lib/auth";
import { one } from "@/lib/db";

export const dynamic = "force-dynamic";

/** An attached file. Only people who can see the case can open it. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) return new Response("Not found.", { status: 404 });
  const a = await one<{ name: string; mime: string; storage: string; url: string }>(
    `select a.name, a.mime, a.storage, a.url from attachments a join cases c on c.id = a.case_id
      where a.id = $1 and ($2::uuid is null or c.owner_id = $2 or exists (select 1 from case_members cm where cm.case_id = c.id and cm.user_id = $2))`,
    [id, user.role === "member" ? user.id : null],
  );
  if (!a) return new Response("Not found.", { status: 404 });
  const body = await openAttachment(a);
  if (!body) return new Response("This file is no longer available.", { status: 410 });
  const inline = (a.mime === "application/pdf" || isImage(a.mime)) && !new URL(req.url).searchParams.has("download");
  const headers: Record<string, string> = {
    "Content-Type": a.mime,
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.name)}`,
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
  };
  if (a.mime !== "application/pdf") headers["Content-Security-Policy"] = "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'";
  return new Response(body as BodyInit, { headers });
}
