import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { ATT_MAX_BYTES, ATT_TYPES } from "@/lib/attach-rules";
import { editablePoint, useBlob } from "@/lib/attachments";
import { getCurrentUser } from "@/lib/auth";
import { getVendorUser } from "@/lib/vendor-auth";

export const dynamic = "force-dynamic";

/** Gives the browser a short-lived permission to upload one file for one point, straight to private storage. */
export async function POST(request: Request) {
  if (!useBlob()) return Response.json({ error: "File storage isn't set up on this server." }, { status: 501 });
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const user = await getCurrentUser();
        // A vendor may only upload files for their own quotes.
        const vendorOk = !user && /^vq\/[^/]{1,160}$/.test(pathname) && !!(await getVendorUser());
        if (!user && !vendorOk) throw new Error("Sign in first.");
        if (vendorOk || !user)
          return { allowedContentTypes: [...new Set(Object.values(ATT_TYPES))], maximumSizeInBytes: ATT_MAX_BYTES, addRandomSuffix: true, validUntil: Date.now() + 10 * 60 * 1000 };
        const approval = /^apv\/[^/]{1,160}$/.test(pathname);
        const m = pathname.match(/^att\/(\d{1,12})\/[^/]{1,160}$/);
        if (!approval && (!m || !(await editablePoint(user, m[1])))) throw new Error("You can't attach files to this point.");
        return {
          allowedContentTypes: [...new Set(Object.values(ATT_TYPES))],
          maximumSizeInBytes: ATT_MAX_BYTES,
          addRandomSuffix: true,
          validUntil: Date.now() + 10 * 60 * 1000,
        };
      },
    });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Upload refused." }, { status: 400 });
  }
}
