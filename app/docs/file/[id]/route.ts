import { isImage } from "@/lib/attach-rules";
import { openAttachment } from "@/lib/attachments";
import { getViewer } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { docsAccess } from "@/lib/xdocs";

export const dynamic = "force-dynamic";

/** An export document. Only the people who can see Export Docs can open it. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Sign in first.", { status: 401 });
  const { me } = await getViewer();
  const { id } = await params;
  if (!docsAccess(me).view || !/^\d{1,12}$/.test(id)) return new Response("Not found.", { status: 404 });
  const f = await one<{ name: string; mime: string; storage: string; url: string }>("select name, mime, storage, url from xd_docs where id = $1 and url is not null", [id]);
  if (!f) return new Response("Not found.", { status: 404 });
  const body = await openAttachment(f);
  if (!body) return new Response("This file is no longer available.", { status: 410 });
  const inline = (f.mime === "application/pdf" || isImage(f.mime)) && !new URL(req.url).searchParams.has("download");
  const headers: Record<string, string> = {
    "Content-Type": f.mime,
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
  };
  if (f.mime !== "application/pdf") headers["Content-Security-Policy"] = "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'";
  return new Response(body as BodyInit, { headers });
}
