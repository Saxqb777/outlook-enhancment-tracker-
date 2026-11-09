// Where attachments live: private Vercel file storage in production, the database when testing locally.
import { randomBytes } from "node:crypto";
import { del, get, head } from "@vercel/blob";
import type { User } from "@/lib/auth";
import { ATT_MAX_BYTES, ATT_MAX_FILES, cleanName, mimeFor, type Uploaded } from "@/lib/attach-rules";
import { one, q } from "@/lib/db";

export const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

/** The point, if this person may add things to it (Members: only on their own cases; never the Admin). */
export async function editablePoint(user: User, pointId: string): Promise<{ id: string; case_id: string } | null> {
  if (user.role === "admin" || !/^\d{1,12}$/.test(pointId)) return null;
  return one<{ id: string; case_id: string }>(
    `select p.id::text as id, p.case_id::text as case_id from points p join cases c on c.id = p.case_id
      where p.id = $1 and ($2::uuid is null or c.owner_id = $2)`,
    [pointId, user.role === "member" ? user.id : null],
  );
}

export type Verified = { name: string; mime: string; size: number; storage: "blob" | "local"; url: string; pathname: string };

/** Checks each uploaded file really is in storage, belongs to this point and follows the rules. */
export async function verifyUploads(pointId: string, files: unknown): Promise<Verified[] | { error: string }> {
  const list = (Array.isArray(files) ? files : []) as Uploaded[];
  if (list.length > ATT_MAX_FILES) return { error: `Attach up to ${ATT_MAX_FILES} files at a time.` };
  const out: Verified[] = [];
  for (const f of list) {
    const name = cleanName(String(f?.name ?? ""));
    const mime = mimeFor(name);
    const url = String(f?.url ?? "");
    if (!mime) return { error: `${name}: this kind of file can't be attached.` };
    if (url.startsWith("local:")) {
      if (useBlob()) return { error: "That file didn't upload properly. Try again." };
      const row = await one<{ size: number }>("select octet_length(data) as size from attachment_local where key = $1 and point_id = $2", [url.slice(6), pointId]);
      if (!row) return { error: `${name} didn't upload properly. Try again.` };
      out.push({ name, mime, size: row.size, storage: "local", url, pathname: `att/${pointId}/${name}` });
    } else {
      if (!useBlob() || !/^https:\/\/[a-z0-9.-]+\.vercel-storage\.com\//i.test(url)) return { error: `${name} didn't upload properly. Try again.` };
      const meta = await head(url).catch(() => null);
      if (!meta || !meta.pathname.startsWith(`att/${pointId}/`) || meta.size > ATT_MAX_BYTES) return { error: `${name} didn't upload properly. Try again.` };
      out.push({ name, mime, size: meta.size, storage: "blob", url: meta.url, pathname: meta.pathname });
    }
  }
  return out;
}

export async function saveLocal(pointId: string, data: Buffer): Promise<string> {
  const key = randomBytes(18).toString("base64url");
  await q("insert into attachment_local (key, point_id, data) values ($1, $2, $3)", [key, pointId, data]);
  return `local:${key}`;
}

/** The file's bytes as a stream, or null if it's gone. */
export async function openAttachment(a: { storage: string; url: string }): Promise<ReadableStream<Uint8Array> | Uint8Array | null> {
  if (a.storage === "local") {
    const row = await one<{ data: Buffer }>("select data from attachment_local where key = $1", [a.url.slice(6)]);
    return row ? new Uint8Array(row.data) : null;
  }
  const res = await get(a.url, { access: "private" }).catch(() => null);
  return res?.stream ?? null;
}

export async function removeStored(a: { storage: string; url: string }) {
  if (a.storage === "local") await q("delete from attachment_local where key = $1", [a.url.slice(6)]);
  else await del(a.url).catch(() => {});
}
