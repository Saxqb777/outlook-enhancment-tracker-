import { del, get, put } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken, put as clientPut } from "@vercel/blob/client";
import { safeEqual } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Owner check of the private file storage: writes, reads and deletes a tiny test file. Needs the setup code. */
export async function POST(req: Request) {
  const code = req.headers.get("x-setup-code") ?? "";
  if (!process.env.SETUP_CODE || !code || !safeEqual(code, process.env.SETUP_CODE)) return Response.json({ error: "Not allowed." }, { status: 403 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return Response.json({ ok: false, error: "BLOB_READ_WRITE_TOKEN is not set." });
  const steps: Record<string, string> = {};
  try {
    const a = await put("selftest/server.txt", "server ok", { access: "private", addRandomSuffix: true, contentType: "text/plain" });
    steps.serverWrite = "ok";
    const r = await get(a.url, { access: "private" });
    steps.serverRead = r && (await new Response(r.stream).text()) === "server ok" ? "ok" : "mismatch";
    const token = await generateClientTokenFromReadWriteToken({ pathname: "selftest/client.txt", addRandomSuffix: true, maximumSizeInBytes: 1024, allowedContentTypes: ["text/plain"] });
    const b = await clientPut("selftest/client.txt", "client ok", { access: "private", token, contentType: "text/plain" });
    steps.clientWrite = "ok";
    const r2 = await get(b.url, { access: "private" });
    steps.clientRead = r2 && (await new Response(r2.stream).text()) === "client ok" ? "ok" : "mismatch";
    const publicFetch = await fetch(b.url).then((x) => x.status).catch(() => 0);
    steps.privateFromOutside = publicFetch === 200 ? "EXPOSED" : `blocked (${publicFetch})`;
    await del([a.url, b.url]);
    steps.delete = "ok";
    return Response.json({ ok: !Object.values(steps).some((v) => v === "mismatch" || v === "EXPOSED"), steps });
  } catch (err) {
    return Response.json({ ok: false, steps, error: err instanceof Error ? err.message : String(err) });
  }
}
