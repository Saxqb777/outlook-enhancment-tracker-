import { checkFile, mimeFor } from "@/lib/attach-rules";
import { editablePoint, saveLocal, useBlob } from "@/lib/attachments";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Local testing only: keeps the file in the database when there's no Vercel file storage. */
export async function POST(request: Request) {
  if (useBlob()) return Response.json({ error: "Not used on this server." }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const pointId = String(form?.get("pointId") ?? "");
  if (!file || typeof file === "string") return Response.json({ error: "No file." }, { status: 400 });
  const approval = pointId === "apv" && user.role !== "admin";
  if (!approval && !(await editablePoint(user, pointId))) return Response.json({ error: "You can't attach files to this point." }, { status: 403 });
  const problem = checkFile(file);
  if (problem || !mimeFor(file.name)) return Response.json({ error: problem ?? "Not allowed." }, { status: 400 });
  const url = await saveLocal(approval ? null : pointId, Buffer.from(await file.arrayBuffer()));
  return Response.json({ url, pathname: `att/${pointId}/${file.name}` });
}
