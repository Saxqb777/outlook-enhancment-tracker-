"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hashPassword, newToken, requireAdmin, VIEW_AS_COOKIE } from "@/lib/auth";
import { VIEW_VENDOR_COOKIE } from "@/lib/vendor-auth";
import { addDaysISO, todayISO } from "@/lib/time";
import { revalidatePath } from "next/cache";
import { one, q, tx } from "@/lib/db";

/** Admin only: show the app the way this person sees it (view only). */
export async function viewAs(form: FormData): Promise<void> {
  await requireAdmin();
  const id = String(form.get("userId") ?? "");
  const target = /^[0-9a-f-]{36}$/.test(id)
    ? await one<{ id: string }>("select id from users where id = $1 and status = 'active' and role <> 'admin'", [id])
    : null;
  if (!target) redirect("/admin");
  (await cookies()).set(VIEW_AS_COOKIE, target.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 3600,
  });
  redirect("/");
}

export async function stopViewAs(): Promise<void> {
  await requireAdmin();
  (await cookies()).delete(VIEW_AS_COOKIE);
  redirect("/admin");
}

/** Admin only: make a Member a Lead, or a Lead a Member, at any time. */
export async function setRole(form: FormData): Promise<void> {
  await requireAdmin();
  const id = String(form.get("userId") ?? "");
  const role = form.get("role") === "lead" ? "lead" : "member";
  // The team always keeps at least one Lead.
  const lastLead = role === "member" && !(await one("select 1 from users where role = 'lead' and status = 'active' and id <> $1", [/^[0-9a-f-]{36}$/.test(id) ? id : null]));
  if (/^[0-9a-f-]{36}$/.test(id) && !lastLead) {
    await q("update users set role = $2 where id = $1 and role in ('lead', 'member') and role <> $2", [id, role]);
    await q("update invites set role = $2 where user_id = $1", [id, role]);
  }
  revalidatePath("/admin");
  revalidatePath("/team");
}

/** Admin only: open a vendor's portal. Real vendors are view only; sandbox vendors can be used. */
export async function viewVendor(form: FormData): Promise<void> {
  await requireAdmin();
  const id = String(form.get("vendorId") ?? "");
  const v = /^\d{1,12}$/.test(id) ? await one<{ id: string }>("select id::text as id from vendors where id = $1", [id]) : null;
  if (!v) redirect("/admin");
  const store = await cookies();
  store.delete(VIEW_AS_COOKIE);
  store.set(VIEW_VENDOR_COOKIE, v.id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 8 * 3600 });
  redirect("/portal");
}

export async function stopViewVendor(): Promise<void> {
  await requireAdmin();
  (await cookies()).delete(VIEW_VENDOR_COOKIE);
  redirect("/admin");
}

/**
 * Admin only: (re)builds the sandbox. Two test vendors and one test request in every state,
 * so every screen can be seen and tried. Only the Admin sees any of it.
 */
export async function resetSandbox(): Promise<void> {
  const me = await requireAdmin();
  const today = todayISO();
  const hash = await hashPassword(newToken());
  await tx(async (c) => {
    await c.query("delete from rfqs where test");
    const vendor = async (name: string, services: string[], person: string, email: string) => {
      const v = await c.query<{ id: string }>(
        "insert into vendors (name, services, areas, phone, notes, created_by, test) values ($1, $2, 'UAE', '+971 50 000 0000', 'Sandbox vendor. Only the Admin sees this.', $3, true) on conflict (lower(name)) do update set status = 'active' returning id::text as id",
        [name, services, me.id],
      );
      const id = v.rows[0].id;
      await c.query("insert into vendor_users (vendor_id, name, email, password_hash) values ($1, $2, $3, $4) on conflict (lower(email)) do nothing", [id, person, email, hash]);
      const u = await c.query<{ id: string }>("select id from vendor_users where vendor_id = $1 order by created_at limit 1", [id]);
      return { id, user: u.rows[0].id, name };
    };
    const A = await vendor("Sandbox Transport (test)", ["Trucking", "Reefer truck"], "Sam Sandbox", "sam@sandbox.invalid");
    const B = await vendor("Sandbox Cargo (test)", ["Trucking", "Flatbed"], "Cara Sandbox", "cara@sandbox.invalid");
    type Q = { price?: number; ready?: number; note?: string; decline?: string };
    const make = async (title: string, fields: [string, string][], status: string, qa: Q | null, qb: Q | null, winner: "A" | "B" | null, chat: [("team" | "A" | "B"), string][] = []) => {
      const r = await c.query<{ id: string }>(
        "insert into rfqs (title, fields, notes, reply_by, status, created_by, test, awarded_vendor_id, award_by, award_note, awarded_at, closed_at) values ($1, $2::jsonb, $3, $4, $5, $6, true, $7, $8, $9, $10, $11) returning id::text as id",
        [title, JSON.stringify(fields.map(([label, value]) => ({ label, value }))), "Sandbox request. Nothing here is real.", addDaysISO(today, 2), status, me.id, winner ? (winner === "A" ? A.id : B.id) : null, winner ? me.id : null, winner ? "Best price and date" : null, ["awarded", "confirmed", "done"].includes(status) ? new Date() : null, ["done", "cancelled"].includes(status) ? new Date() : null],
      );
      const id = r.rows[0].id;
      for (const [v, qq] of [[A, qa], [B, qb]] as const) {
        const state = !qq ? "invited" : qq.decline ? "declined" : "quoted";
        await c.query("insert into rfq_vendors (rfq_id, vendor_id, state, price, currency, ready_on, valid_until, note, decline_reason, quoted_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)", [id, v.id, state, qq?.price ?? null, qq?.price ? "AED" : null, qq?.price ? addDaysISO(today, qq.ready ?? 3) : null, qq?.price ? addDaysISO(today, 10) : null, qq?.note ?? null, qq?.decline ?? null, qq ? new Date() : null]);
        await c.query("insert into rfq_messages (rfq_id, vendor_id, user_id, kind, body) values ($1, $2, $3, 'system', $4)", [id, v.id, me.id, `${me.name} sent you this request.`]);
        if (qq?.price) {
          await c.query("insert into rfq_quotes (rfq_id, vendor_id, vendor_user_id, price, currency, note) values ($1, $2, $3, $4, 'AED', $5)", [id, v.id, v.user, qq.price, qq.note ?? null]);
          await c.query("insert into rfq_messages (rfq_id, vendor_id, vendor_user_id, kind, body) values ($1, $2, $3, 'system', $4)", [id, v.id, v.user, `${v.name} quoted AED ${qq.price.toLocaleString("en-US")}.`]);
        } else if (qq?.decline) await c.query("insert into rfq_messages (rfq_id, vendor_id, vendor_user_id, kind, body) values ($1, $2, $3, 'system', $4)", [id, v.id, v.user, `${v.name} can't do this one: ${qq.decline}`]);
      }
      for (const [who, body] of chat) {
        if (who === "team") await c.query("insert into rfq_messages (rfq_id, vendor_id, user_id, kind, body) values ($1, $2, $3, 'text', $4)", [id, A.id, me.id, body]);
        else await c.query("insert into rfq_messages (rfq_id, vendor_id, vendor_user_id, kind, body) values ($1, $2, $3, 'text', $4)", [id, who === "A" ? A.id : B.id, who === "A" ? A.user : B.user, body]);
      }
      if (winner && status !== "pending_award") {
        const w = winner === "A" ? A : B;
        const l = winner === "A" ? B : A;
        await c.query("insert into rfq_messages (rfq_id, vendor_id, user_id, kind, body) values ($1, $2, $3, 'system', 'Your quote was chosen. Please confirm you can do the job.')", [id, w.id, me.id]);
        await c.query("insert into rfq_messages (rfq_id, vendor_id, user_id, kind, body) values ($1, $2, $3, 'system', 'Thank you for your reply. Another quote was chosen this time.')", [id, l.id, me.id]);
        if (status !== "awarded") await c.query("insert into rfq_messages (rfq_id, vendor_id, vendor_user_id, kind, body) values ($1, $2, $3, 'system', $4)", [id, w.id, w.user, `${w.name} confirmed the job.`]);
      }
      if (winner) {
        // Jobs: milestones are set with the choice; a running job is part-way, a finished one is all done.
        const w = winner === "A" ? A : B;
        const doneN = status === "done" ? 5 : status === "confirmed" ? 2 : 0;
        const names = ["Truck and driver assigned", "Picked up", "On the way", "Delivered", "Proof of delivery"];
        for (let i = 0; i < names.length; i++)
          await c.query("insert into job_milestones (rfq_id, position, title, needs_pod, done_at, done_by, done_note) values ($1, $2, $3, $4, $5, $6, $7)", [id, i + 1, names[i], i === 4, i < doneN ? new Date(Date.now() - (doneN - i) * 3600e3) : null, i < doneN ? w.name.replace(" (test)", "") : null, i === 0 && doneN ? "Driver Ali, 050 000 0000, truck DXB 12345" : null]);
        await c.query("update rfqs set job_due = $2, rating = $3 where id = $1", [id, addDaysISO(today, status === "done" ? 0 : 3), status === "done" ? 4 : null]);
        if (status === "confirmed") await c.query("update job_milestones set problem = 'Stuck in traffic near Al Ain, about 2 hours late', problem_at = now() where rfq_id = $1 and position = 3", [id]);
      }
      if (status === "pending_award") await c.query("insert into rfq_messages (rfq_id, vendor_id, user_id, kind, body) values ($1, $2, $3, 'internal', 'A Member wants to award this and is waiting for a Lead to approve. Reason: Best price and date')", [id, winner === "A" ? A.id : B.id, me.id]);
      if (status === "cancelled") await c.query("insert into rfq_messages (rfq_id, vendor_id, user_id, kind, body) select rfq_id, vendor_id, $2, 'system', 'This request was cancelled. No quote is needed.' from rfq_vendors where rfq_id = $1", [id, me.id]);
    };
    const route = (from: string, to: string, cargo: string): [string, string][] => [["From", from], ["To", to], ["Cargo", cargo], ["Pickup date", addDaysISO(today, 4)]];
    await make("9. Cancelled request", route("Sharjah", "Fujairah", "Empty pallets"), "cancelled", { price: 700 }, null, null);
    await make("8. Awarded to the other vendor (Sandbox Transport sees: not chosen)", route("Jebel Ali", "Ras Al Khaimah", "Bottled water, 22 pallets"), "awarded", { price: 1900 }, { price: 1750, ready: 2 }, "B");
    await make("7. Job done", route("Abu Dhabi", "Dubai", "Dry goods, 18 pallets"), "done", { price: 1500, note: "Includes tolls" }, { price: 1650 }, "A");
    await make("6. Confirmed by the vendor (ready to mark done)", route("Khalifa Port", "Al Ain", "Juice, 26 pallets"), "confirmed", { price: 2300 }, { decline: "No trucks free" }, "A");
    await make("5. Awarded, waiting for the vendor to confirm", route("Jebel Ali", "Abu Dhabi", "Dairy, 30 pallets"), "awarded", { price: 2050, ready: 2 }, { price: 2200 }, "A");
    await make("4. Waiting for a Lead to approve the choice", route("Mussafah", "Dubai", "Generator, 4 tons"), "pending_award", { price: 3100 }, { price: 2800, ready: 2 }, "B");
    await make("3. One vendor can't do it", route("Dubai", "Muscat", "Frozen poultry, 20 pallets"), "open", { decline: "We don't cover Oman" }, { price: 5200 }, null);
    await make("2. Quotes are in: compare, chat, choose", route("Jebel Ali", "Al Ain", "Frozen poultry, 40 pallets"), "open", { price: 2400, ready: 5, note: "Includes fuel" }, { price: 2100, ready: 3 }, null, [["team", "Can you do 2,200?"], ["A", "Let me check with my manager."]]);
    await make("1. New request: nobody has replied yet", route("Jebel Ali", "Sharjah", "Snacks, 12 pallets"), "open", null, null, null);
  });
  revalidatePath("/admin");
  revalidatePath("/vendors", "layout");
  redirect("/admin#sandbox");
}
