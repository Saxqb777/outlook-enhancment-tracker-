import { isImage } from "@/lib/attach-rules";
import { openAttachment } from "@/lib/attachments";
import { getCurrentUser } from "@/lib/auth";
import { canSeeCase } from "@/lib/chat";
import { one } from "@/lib/db";
import { getVendorUser } from "@/lib/vendor-auth";

export const dynamic = "force-dynamic";

/**
 * A file sent in a chat. Case chat: the people on the case, the Leads and the Admin.
 * Vendor chat: the team, and only the one vendor that chat belongs to.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const vendor = user ? null : await getVendorUser();
  if (!user && !vendor) return new Response("Sign in first.", { status: 401 });
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) return new Response("Not found.", { status: 404 });
  const f = await one<{ name: string; mime: string; storage: string; url: string; case_id: string | null; vendor_id: string | null; test: boolean | null }>(
    `select f.name, f.mime, f.storage, f.url, cm.case_id::text as case_id, rm.vendor_id::text as vendor_id, r.test
       from chat_files f left join case_messages cm on cm.id = f.case_message_id
       left join rfq_messages rm on rm.id = f.rfq_message_id left join rfqs r on r.id = rm.rfq_id where f.id = $1`,
    [id],
  );
  const allowed = !f
    ? false
    : f.case_id
      ? !!user && (await canSeeCase(user, f.case_id))
      : user
        ? !f.test || user.role === "admin"
        : vendor!.vendor_id === f.vendor_id;
  if (!f || !allowed) return new Response("Not found.", { status: 404 });
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
