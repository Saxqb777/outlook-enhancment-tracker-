// Vendor people have their own accounts and sessions, apart from the team's, so a vendor can never reach team pages.
// The Admin can also look at a vendor's portal: view only for real vendors, fully usable for sandbox (test) vendors.
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser, hashToken, newToken } from "@/lib/auth";
import { one, q } from "@/lib/db";

export const VENDOR_COOKIE = "ae_vendor";
/** Set only for the Admin: which vendor's portal they are looking at. */
export const VIEW_VENDOR_COOKIE = "ae_view_vendor";
const SESSION_DAYS = 30;

export type VendorUser = {
  id: string;
  name: string;
  email: string;
  vendor_id: string;
  vendor: string;
  /** True when the Admin is looking at a real vendor's portal: nothing can be changed. */
  viewOnly: boolean;
  /** True when this is the Admin looking, not the vendor themselves. */
  admin: boolean;
  /** True for a sandbox (test) vendor. */
  sandbox: boolean;
};

export async function createVendorSession(vendorUserId: string): Promise<void> {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await q("insert into vendor_sessions (id, vendor_user_id, expires_at) values ($1, $2, $3)", [hashToken(token), vendorUserId, expires]);
  await q("update vendor_users set last_login_at = now() where id = $1", [vendorUserId]);
  (await cookies()).set(VENDOR_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires });
}

export async function destroyVendorSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(VENDOR_COOKIE)?.value;
  if (token) await q("delete from vendor_sessions where id = $1", [hashToken(token)]);
  store.delete(VENDOR_COOKIE);
}

export const getVendorUser = cache(async (): Promise<VendorUser | null> => {
  const store = await cookies();
  const token = store.get(VENDOR_COOKIE)?.value;
  if (token) {
    const v = await one<Omit<VendorUser, "viewOnly" | "admin" | "sandbox">>(
      `select u.id, u.name, u.email, v.id::text as vendor_id, v.name as vendor
         from vendor_sessions s join vendor_users u on u.id = s.vendor_user_id join vendors v on v.id = u.vendor_id
        where s.id = $1 and s.expires_at > now() and u.status = 'active' and v.status = 'active' and not v.test`,
      [hashToken(token)],
    );
    if (v) return { ...v, viewOnly: false, admin: false, sandbox: false };
  }
  const as = store.get(VIEW_VENDOR_COOKIE)?.value ?? "";
  if (!/^\d{1,12}$/.test(as)) return null;
  const me = await getCurrentUser();
  if (me?.role !== "admin") return null;
  const v = await one<{ vendor_id: string; vendor: string; test: boolean; id: string | null; name: string | null; email: string | null }>(
    `select v.id::text as vendor_id, v.name as vendor, v.test, u.id, u.name, u.email
       from vendors v left join lateral (select id, name, email from vendor_users where vendor_id = v.id order by created_at limit 1) u on true where v.id = $1`,
    [as],
  );
  if (!v) return null;
  // A sandbox vendor can be used for real by the Admin; a real vendor's portal can only be looked at.
  const usable = v.test && !!v.id;
  return { id: v.id ?? "", name: v.name ?? "Nobody has joined yet", email: v.email ?? "", vendor_id: v.vendor_id, vendor: v.vendor, viewOnly: !usable, admin: true, sandbox: v.test };
});

export async function requireVendor(): Promise<VendorUser> {
  const v = await getVendorUser();
  if (!v) redirect("/login");
  return v;
}
