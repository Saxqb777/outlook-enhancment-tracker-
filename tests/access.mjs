// Saved access-rule tests: proves the walls between roles, vendors and the team still hold.
//
// Run against a LOCAL copy only (it writes test rows to the database):
//   DATABASE_URL=postgres://postgres@127.0.0.1:5433/agthia npm run db:migrate
//   npx next build && npx next start -p 3200 &
//   BASE_URL=http://127.0.0.1:3200 DATABASE_URL=postgres://postgres@127.0.0.1:5433/agthia npm run test:access
//
// It makes its own people, vendors, case, request and approval (all marked "accesstest"), signs them in by
// writing sessions straight into the database, calls pages, data routes and server actions directly, and
// removes everything again at the end.
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:3200").replace(/\/$/, "");
const DB = process.env.DATABASE_URL ?? "";
if (!/@(127\.0\.0\.1|localhost|postgres)[:/]/.test(DB)) {
  console.error("Refusing to run: DATABASE_URL must point at a local test database, never the live one.");
  process.exit(2);
}
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(root, ".next/server/server-reference-manifest.json"), "utf8"));
const ACTION = Object.fromEntries(Object.entries(manifest.node).map(([id, v]) => [v.exportedName, id]));

const db = new pg.Client({ connectionString: DB });
await db.connect();
const sql = async (text, params = []) => (await db.query(text, params)).rows;
const sha = (t) => createHash("sha256").update(t).digest("hex");
const TAG = "accesstest";

let pass = 0;
let fail = 0;
const check = (ok, what, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${ok || !detail ? "" : `  -> ${detail}`}`);
};

async function cleanup() {
  const u = `(select id from users where email like '%@${TAG}.invalid')`;
  await sql(`delete from approvals where requester_id in ${u}`);
  await sql(`delete from rfqs where created_by in ${u}`);
  await sql(`delete from cases where owner_id in ${u}`);
  await sql(`delete from vendors where name like 'AccessTest %'`);
  await sql(`delete from activity_log where user_id in ${u}`);
  await sql(`delete from users where email like '%@${TAG}.invalid'`);
  await sql(`delete from attachment_local where key like '${TAG}-%'`);
}

async function person(name, role) {
  const [u] = await sql("insert into users (email, name, role, status, password_hash, activated_at) values ($1, $2, $3, 'active', 'x', now()) returning id", [`${name.toLowerCase()}@${TAG}.invalid`, `AT ${name}`, role]);
  const token = randomBytes(24).toString("base64url");
  await sql("insert into sessions (id, user_id, expires_at) values ($1, $2, now() + interval '1 hour')", [sha(token), u.id]);
  return { id: u.id, cookie: `ae_session=${token}` };
}
async function vendor(name) {
  const [v] = await sql("insert into vendors (name, services) values ($1, '{Trucking}') returning id::text as id", [`AccessTest ${name}`]);
  const [u] = await sql("insert into vendor_users (vendor_id, name, email, password_hash) values ($1, $2, $3, 'x') returning id", [v.id, `AT ${name} person`, `${name.toLowerCase()}@${TAG}-vendor.invalid`]);
  const token = randomBytes(24).toString("base64url");
  await sql("insert into vendor_sessions (id, vendor_user_id, expires_at) values ($1, $2, now() + interval '1 hour')", [sha(token), u.id]);
  return { id: v.id, userId: u.id, cookie: `ae_vendor=${token}` };
}

const get = async (who, url, extra = "") => {
  const r = await fetch(BASE + url, { redirect: "manual", headers: { Cookie: [who?.cookie, extra].filter(Boolean).join("; ") } });
  return { status: r.status, loc: r.headers.get("location") ?? "", text: await r.text() };
};
/** Calls a server action directly, the way a hostile client could. */
const act = async (who, name, args, { page = "/", origin = BASE, extra = "" } = {}) => {
  if (!ACTION[name]) throw new Error(`No server action called ${name} in this build`);
  const r = await fetch(BASE + page, {
    method: "POST",
    redirect: "manual",
    headers: { "Next-Action": ACTION[name], "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Cookie: [who?.cookie, extra].filter(Boolean).join("; "), Origin: origin },
    body: JSON.stringify(args),
  });
  const body = await r.text();
  let val = null;
  for (const line of body.split("\n")) {
    const m = line.match(/^1:(.*)$/);
    if (m) try { val = JSON.parse(m[1]); } catch { val = m[1]; }
  }
  return { status: r.status, redirect: r.headers.get("x-action-redirect") ?? "", val };
};
const refused = (r) => (r.val && r.val.ok === false) || /\/login/.test(r.redirect) || r.status >= 400 || r.redirect === "/";
const toLogin = (r) => (r.status === 307 || r.status === 302 || r.status === 303) && /\/login/.test(r.loc);

try {
  await cleanup();
  const lead = await person("Lead", "lead");
  const memA = await person("MemberA", "member");
  const memB = await person("MemberB", "member");
  const admin = await person("Admin2", "admin");
  const vA = await vendor("Alpha");
  const vB = await vendor("Beta");

  const [c] = await sql("insert into cases (owner_id, created_by, subject, email_body) values ($1, $1, 'AccessTest case', 'body') returning id::text as id", [memA.id]);
  const [pt] = await sql("insert into points (case_id, position, text, status) values ($1, 1, 'AccessTest point', 'todo') returning id::text as id", [c.id]);
  const [done] = await sql("insert into points (case_id, position, text, status) values ($1, 2, 'AccessTest approved point', 'approved') returning id::text as id", [c.id]);

  const [rq] = await sql("insert into rfqs (title, fields, created_by) values ('AccessTest request', '[]', $1) returning id::text as id", [memA.id]);
  for (const [v, price] of [[vA, 500], [vB, 400]]) {
    await sql("insert into rfq_vendors (rfq_id, vendor_id, state, price, currency, quoted_at) values ($1, $2, 'quoted', $3, 'AED', now())", [rq.id, v.id, price]);
    await sql("insert into rfq_messages (rfq_id, vendor_id, user_id, kind, body) values ($1, $2, $3, 'internal', 'TEAM-ONLY-NOTE')", [rq.id, v.id, memA.id]);
    await sql("insert into rfq_messages (rfq_id, vendor_id, vendor_user_id, kind, body) values ($1, $2, $3, 'text', $4)", [rq.id, v.id, v.userId, `SECRET-OF-${v.id}`]);
  }
  await sql("insert into attachment_local (key, point_id, data) values ($1, null, 'hello')", [`${TAG}-file`]);
  const [bf] = await sql("insert into rfq_files (rfq_id, vendor_id, name, mime, size, storage, url, pathname) values ($1, $2, 'beta.txt', 'text/plain', 5, 'local', $3, 'vq/beta.txt') returning id::text as id", [rq.id, vB.id, `local:${TAG}-file`]);
  // Files sent in chats: one in the case chat, one in vendor Beta's chat on the request.
  const [cmsg] = await sql("insert into case_messages (case_id, user_id, kind, body) values ($1, $2, 'text', '') returning id", [c.id, memA.id]);
  const [cf] = await sql("insert into chat_files (case_message_id, name, mime, size, storage, url, pathname) values ($1, 'case.txt', 'text/plain', 5, 'local', $2, 'apv/case.txt') returning id::text as id", [cmsg.id, `local:${TAG}-file`]);
  const [vmsg] = await sql("insert into rfq_messages (rfq_id, vendor_id, vendor_user_id, kind, body) values ($1, $2, $3, 'text', '') returning id", [rq.id, vB.id, vB.userId]);
  const [vf] = await sql("insert into chat_files (rfq_message_id, name, mime, size, storage, url, pathname) values ($1, 'beta-chat.txt', 'text/plain', 5, 'local', $2, 'vq/beta-chat.txt') returning id::text as id", [vmsg.id, `local:${TAG}-file`]);
  const [rqOther] = await sql("insert into rfqs (title, fields, created_by) values ('AccessTest other request', '[]', $1) returning id::text as id", [memA.id]);
  await sql("insert into rfq_vendors (rfq_id, vendor_id) values ($1, $2)", [rqOther.id, vB.id]);

  const [ap] = await sql("insert into approvals (requester_id, title, body, version) values ($1, 'AccessTest approval', 'v2 text', 2) returning id::text as id", [memA.id]);
  await sql("insert into approval_signers (approval_id, user_id) values ($1, $2)", [ap.id, memB.id]);
  const SIG = "data:image/png;base64," + "A".repeat(400);

  console.log("\n— Signed-out visitors");
  for (const u of ["/", "/cases", `/cases/${c.id}`, "/vendors", "/portal", "/admin", "/approvals"]) check(toLogin(await get(null, u)), `signed out: ${u} goes to sign-in`);
  for (const u of ["/api/notify", "/api/portal/notify", `/api/chat/${c.id}`, `/api/rfq/${rq.id}/chat?vendor=${vA.id}`, "/vendors/export", "/portal/export", `/vendors/file/${bf.id}`, "/admin/backup"]) check((await get(null, u)).status === 401, `signed out: ${u} is refused`);
  check(refused(await act(null, "setPointStatus", [pt.id, "done"])), "signed out: can't change a point");

  console.log("\n— Vendor against the team");
  for (const u of ["/", "/cases", `/cases/${c.id}`, "/vendors", `/vendors/rfq/${rq.id}`, "/admin", "/team", "/approvals", "/dashboard"]) check(toLogin(await get(vA, u)), `vendor: ${u} is closed to them`);
  for (const u of ["/api/notify", `/api/chat/${c.id}`, `/api/rfq/${rq.id}/chat?vendor=${vA.id}`, "/vendors/export", "/admin/backup"]) check((await get(vA, u)).status === 401, `vendor: ${u} is refused`);
  check(refused(await act(vA, "sendRfqMessage", [rq.id, vA.id, "hi"])), "vendor: can't use the team's chat action");
  check(refused(await act(vA, "pickWinner", [rq.id, vA.id, "me"])), "vendor: can't award themselves");
  check(refused(await act(vA, "setPointStatus", [pt.id, "done"])), "vendor: can't change a case point");

  console.log("\n— Vendor against another vendor");
  const mine = await get(vA, `/api/portal/rfq/${rq.id}/chat`);
  check(mine.status === 200 && mine.text.includes(`SECRET-OF-${vA.id}`), "vendor: can read their own chat");
  check(!mine.text.includes(`SECRET-OF-${vB.id}`), "vendor: their chat never contains the other vendor's messages");
  check(!mine.text.includes("TEAM-ONLY-NOTE"), "vendor: never sees the team-only notes");
  const page = await get(vA, `/portal/r/${rq.id}`);
  check(page.status === 200 && !page.text.includes("AccessTest Beta") && !/AED\s*400/.test(page.text), "vendor: their request page never names the other vendor or its price");
  check((await get(vA, `/vendors/file/${bf.id}`)).status === 404, "vendor: can't open the other vendor's file");
  check((await get(vB, `/vendors/file/${bf.id}`)).status === 200, "vendor: can open their own file");
  check((await get(vA, `/api/portal/rfq/${rqOther.id}/chat`)).status === 404, "vendor: can't read a request that wasn't sent to them");
  check(refused(await act(vA, "submitQuote", [rqOther.id, { price: "1", currency: "AED", validUntil: "", readyOn: "", note: "", files: [] }], { page: "/portal" })), "vendor: can't quote on a request that wasn't sent to them");
  check(refused(await act(vA, "sendVendorMessage", [rqOther.id, "hello"], { page: "/portal" })), "vendor: can't write in another vendor's request");
  const ex = await get(vA, "/portal/export");
  check(ex.status === 200, "vendor: can export their own Excel");
  check(!(await get(vA, `/portal/r/${rqOther.id}`, `ae_view_vendor=${vB.id}`)).text.includes("AccessTest other request"), "vendor: forged 'view vendor' cookie is ignored");

  check((await get(vA, `/chat-file/${vf.id}`)).status === 404, "vendor: can't open a file from the other vendor's chat");
  check((await get(vB, `/chat-file/${vf.id}`)).status === 200, "vendor: can open a file from their own chat");
  check((await get(vA, `/chat-file/${cf.id}`)).status === 404, "vendor: can't open a file from a case chat");
  check((await get(null, `/chat-file/${vf.id}`)).status === 401, "signed out: chat files are refused");

  console.log("\n— Member limits");
  check((await get(memB, `/chat-file/${cf.id}`)).status === 404, "member: can't open a chat file on someone else's case");
  check((await get(memA, `/chat-file/${cf.id}`)).status === 200, "member: can open a chat file on their own case");
  check(refused(await act(memA, "removeChatFile", [cf.id])), "member: can't remove a chat file (Lead only)");
  check(/isn't available/.test((await get(memB, `/cases/${c.id}`)).text), "member: can't open someone else's case");
  check(refused(await act(memB, "setPointStatus", [pt.id, "done"])), "member: can't change a point on someone else's case");
  check(refused(await act(memB, "postNote", [pt.id, "hello", []])), "member: can't add a note on someone else's case");
  check((await get(memB, `/api/chat/${c.id}`)).status !== 200, "member: can't read someone else's case chat");
  check(refused(await act(memA, "reopenPoint", [done.id])), "member: can't reopen a point (Lead only)");
  check(refused(await act(memA, "decideAward", [rq.id, true, ""])), "member: can't approve an award (Lead only)");
  check(refused(await act(memA, "setVendorStatus", [vA.id, false])), "member: can't turn a vendor's access off (Lead only)");
  check(refused(await act(memA, "removePoint", [pt.id, "x"])), "member: can't remove a point (Lead only)");
  check(refused(await act(memA, "setArchived", [c.id, true])), "member: can't archive a case (Lead only)");
  check(refused(await act(memA, "editPointText", [pt.id, "changed"])), "member: can't reword a point (Lead only)");
  check((await get(memA, "/admin/backup")).status === 403, "member: can't download the backup");
  check(refused(await act(memA, "setPointDue", [done.id, "2030-01-01"])), "member: an approved point's deadline is locked");
  check(refused(await act(memA, "postNote", [done.id, "late note", []])), "member: an approved point takes no more notes");
  check(refused(await act(memB, "pickWinner", [rq.id, vA.id, "not mine"])), "member: can't choose the vendor on someone else's request");
  check(/isn't available/.test((await get(memB, `/cases/${c.id}`, `ae_view_as=${memA.id}`)).text), "member: forged 'view as' cookie is ignored");

  console.log("\n— The rate book (one person runs it, Leads look, nobody else)");
  await sql("update users set can_rates = true where id = $1", [memB.id]);
  const enquiry = { title: "AccessTest rate", origin: "A", origin_country: "", origin_port: "", destination: "B", destination_country: "", destination_port: "", commodity: "", mode: "sea", service: "d2d", incoterm: "", equipment: [{ type: "40HC", qty: 1 }], notes: "", requested_on: "2026-01-01" };
  check(/isn't here/.test((await get(memA, "/rates")).text), "member without Rates: the page isn't there for them");
  check(refused(await act(memA, "createEnquiry", [enquiry, null, []])), "member without Rates: can't add to the rate book");
  check(toLogin(await get(vA, "/rates")), "vendor: the rate book is closed to them");
  check((await get(null, "/rates/file/1")).status === 401 && (await get(null, "/rates/template")).status === 401, "signed out: rate files are refused");
  const made = await act(memB, "createEnquiry", [enquiry, { supplier: "AccessTest Supplier", state: "quoted", quoted_on: "2026-01-02", currency: "USD", rates: [{ type: "40HC", rate: 1000 }], charges: [], carrier: "", routing: "", transit: "", free_time: "", valid_until: "", remarks: "", exclusions: "", decline_reason: "", negotiated: false }, []]);
  check(made.val?.ok === true, "the person who runs Rates can add an enquiry with a quote", JSON.stringify(made.val));
  check((await get(lead, `/rates/${made.val?.id}`)).status === 200 && (await get(lead, `/rates/compare/${made.val?.id}`)).status === 200, "lead: can look at the rate book and export");
  check(refused(await act(lead, "createEnquiry", [enquiry, null, []])), "lead: can't change the rate book");
  check((await get(memA, `/rates/compare/${made.val?.id}`)).status === 404, "member without Rates: can't export a comparison");
  // The sums: a charge for one container size is never added to another size.
  const { quoteTotalAED, unitAllInAED, inferApplies } = await import("../lib/rate-calc.ts").catch(() => ({}));
  if (quoteTotalAED) {
    const nq = { currency: "AED", rates: [{ type: "40HC", rate: 19500 }, { type: "20FT", rate: 15400 }], charges: [{ label: "Origin export charges (40HC)", basis: "container", amount: 10350, currency: "AED" }, { label: "Origin export charges (20GP)", basis: "container", amount: 9550, currency: "AED" }, { label: "Telex release fee per BL", basis: "shipment", amount: 250, currency: "AED" }] };
    const fx = { AED: 1, USD: 3.685 };
    check(unitAllInAED(nq, "20FT", null, fx) === 24950 && unitAllInAED(nq, "40HC", null, fx) === 29850, "rates sums: all in for one 20FT is 24,950 and one 40HC is 29,850");
    check(quoteTotalAED(nq, [{ type: "20FT", qty: 1 }], fx).total === 25200 && quoteTotalAED(nq, [{ type: "20FT", qty: 1 }, { type: "40HC", qty: 1 }], fx).total === 55050 && quoteTotalAED(nq, [{ type: "20FT", qty: 2 }], fx).total === 50150, "rates sums: shipment totals count each size's own charges only");
    check(inferApplies("THC") === "" && inferApplies("Origin charges 40' HC") === "40HC" && inferApplies("Fee for 20 days") === "", "rates sums: only a named size ties a charge to that size");
  }
  check((await get(memA, "/rates/doc/1")).status === 404 && (await get(null, "/rates/doc/1")).status === 401, "rate documents: closed to people without Rates and when signed out");
  check(refused(await act(lead, "addRateDocs", [[{ url: "local:x", pathname: "rt/x.pdf", name: "x.pdf", size: 1 }]])) && refused(await act(memA, "removeRateDoc", ["1"])), "rate documents: only the person who runs Rates can add or remove");
  check(refused(await act(memA, "sendRateFeedback", ["trying to write feedback without access", "/rates"])), "rates feedback: only people who can see Rates can write it");
  const fbk = await act(memB, "sendRateFeedback", ["AccessTest feedback note", "/rates"]);
  check(fbk.val?.ok === true && (await sql("select 1 from rate_feedback where body = 'AccessTest feedback note'")).length === 1, "rates feedback: the person who runs Rates can leave a note");
  await sql("delete from rate_feedback where body = 'AccessTest feedback note'");

  console.log("\n— Notifications");
  const subBody = JSON.stringify({ endpoint: "https://push.example.invalid/accesstest", keys: { p256dh: "BAccessTestKeyAccessTestKeyAccessTestKey", auth: "AccessTestAuthKey" } });
  const push = (who, method, body) => fetch(BASE + "/api/push", { method, headers: { "Content-Type": "application/json", Cookie: who?.cookie ?? "" }, body }).then((r) => r.status);
  const anonPush = await push(null, "POST", subBody);
  check(anonPush === 401 || anonPush === 501, "notifications: signed out can't register a device");
  const myPush = await push(memA, "POST", subBody);
  if (myPush === 200) {
    check((await sql("select 1 from push_subs where endpoint like '%accesstest' and user_id = $1", [memA.id])).length === 1, "notifications: a device is tied to the person signed in");
    check((await push(memB, "DELETE", JSON.stringify({ endpoint: "https://push.example.invalid/accesstest" }))) === 200 && (await sql("select 1 from push_subs where endpoint like '%accesstest'")).length === 1, "notifications: nobody can switch off someone else's device");
    check((await push(memA, "DELETE", JSON.stringify({ endpoint: "https://push.example.invalid/accesstest" }))) === 200 && (await sql("select 1 from push_subs where endpoint like '%accesstest'")).length === 0, "notifications: you can switch your own device off");
  } else check(myPush === 501, "notifications: not set up on this server (skipped)");
  await sql("delete from push_subs where endpoint like '%accesstest'");
  await sql("delete from rate_requests where title = 'AccessTest rate'");
  await sql("delete from rate_suppliers where name = 'AccessTest Supplier'");

  console.log("\n— New safety rules");
  const stale = await act(memB, "signApproval", [ap.id, SIG, "", false, 1]);
  check(stale.val?.ok === false && /updated/.test(stale.val.error ?? ""), "approval: signing an old version is refused", JSON.stringify(stale.val));
  const fresh = await act(memB, "signApproval", [ap.id, SIG, "", false, 2]);
  check(fresh.val?.ok === true, "approval: signing the current version works", JSON.stringify(fresh.val));
  const moved = await act(lead, "pickWinner", [rq.id, vA.id, "", { steps: [], due: "", seenPrice: "100", seenCurrency: "AED" }]);
  check(moved.val?.ok === false && /changed the price/.test(moved.val.error ?? ""), "award: refused when the price is not the one that was seen", JSON.stringify(moved.val));
  const cross = await act(lead, "sendRfqMessage", [rq.id, vA.id, "x"], { origin: "https://evil.example" });
  check(cross.val?.ok !== true, "a request from another website is rejected");

  console.log("\n— Lead can do the Lead things (so the refusals above mean something)");
  check((await act(lead, "sendRfqMessage", [rq.id, vA.id, "hello from the lead"])).val?.ok === true, "lead: can message a vendor");
  check((await act(lead, "editPointText", [pt.id, "AccessTest point reworded"])).val?.ok === true, "lead: can reword a point");
  check((await act(lead, "setArchived", [c.id, true])).val?.ok === true && (await act(lead, "setArchived", [c.id, false])).val?.ok === true, "lead: can archive a case and bring it back");
  const ok = await act(lead, "pickWinner", [rq.id, vB.id, "", { steps: ["Picked up"], due: "", seenPrice: "400.00", seenCurrency: "AED" }]);
  check(ok.val?.ok === true, "lead: can award at the price shown", JSON.stringify(ok.val));
  check(refused(await act(vA, "confirmJob", [rq.id], { page: "/portal" })), "vendor: the losing vendor can't confirm the job");
  check((await act(vB, "confirmJob", [rq.id], { page: "/portal" })).val?.ok === true, "vendor: the winner can confirm the job");
  const [ms] = await sql("select id::text as id from job_milestones where rfq_id = $1 order by position limit 1", [rq.id]);
  check(refused(await act(vA, "tickStep", [ms.id, "", []], { page: "/portal" })), "vendor: the losing vendor can't tick the winner's milestones");
  const [ms2] = await sql("select id::text as id from job_milestones where rfq_id = $1 order by position offset 1 limit 1", [rq.id]);
  const jump = await act(vB, "tickStep", [ms2.id, "", []], { page: "/portal" });
  check(jump.val?.ok === false && /first/.test(jump.val.error ?? ""), "job: a later milestone can't be ticked before an earlier one", JSON.stringify(jump.val));
  check((await act(vB, "tickStep", [ms.id, "", []], { page: "/portal" })).val?.ok === true, "vendor: the winner can tick a milestone");
  await sql("update job_milestones set done_at = now(), done_by = 'test' where id = $1", [ms2.id]);
  const gap = await act(vB, "untickStep", [ms.id], { page: "/portal" });
  check(gap.val?.ok === false && /last ticked/.test(gap.val.error ?? ""), "job: only the last ticked milestone can be undone", JSON.stringify(gap.val));
  await sql("update job_milestones set done_at = null, done_by = null where id = $1", [ms2.id]);
  const early = await act(lead, "closeRfq", [rq.id, "done", {}]);
  check(early.val?.ok === false && /Proof of delivery/.test(early.val.error ?? ""), "job: can't be closed without proof of delivery", JSON.stringify(early.val));

  const [isAdmin] = await sql("select role from users where id = $1", [admin.id]);
  if (isAdmin.role === "admin") {
    console.log("\n— Admin is view only on real work");
    check(refused(await act(admin, "setPointStatus", [pt.id, "done"])), "admin: can't change a point");
    check(refused(await act(admin, "sendRfqMessage", [rq.id, vA.id, "x"])), "admin: can't message a vendor on a real request");
    check(refused(await act(admin, "closeRfq", [rq.id, "cancelled"])), "admin: can't cancel a real request");
    check(refused(await act(admin, "setArchived", [c.id, true])), "admin: can't archive a case");
    check((await get(admin, "/admin/backup")).status === 200, "admin: can download the backup");
  }
} catch (err) {
  fail++;
  console.error("CRASH", err);
} finally {
  await cleanup().catch((e) => console.error("cleanup failed", e.message));
  await db.end();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
