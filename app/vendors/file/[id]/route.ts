import { isImage } from "@/lib/attach-rules";
import { openAttachment } from "@/lib/attachments";
import { getCurrentUser } from "@/lib/auth";
import { getVendorUser } from "@/lib/vendor-auth";
import { rfqFile } from "@/lib/vendors";

export const dynamic = "force-dynamic";

/** A document on a quote request. The team can open any; a vendor only the request's documents and their own. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const vendor = user ? null : await getVendorUser();
  if (!user && !vendor) return new Response("Sign in first.", { status: 401 });
  const { id } = await params;
  const f = await rfqFile(id, vendor ? vendor.vendor_id : null);
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
