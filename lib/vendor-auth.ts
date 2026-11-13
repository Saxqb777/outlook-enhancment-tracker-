// Vendor people have their own accounts and sessions, apart from the team's, so a vendor can never reach team pages.
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hashToken, newToken } from "@/lib/auth";
import { one, q } from "@/lib/db";

export const VENDOR_COOKIE = "ae_vendor";
const SESSION_DAYS = 30;

export type VendorUser = { id: string; name: string; email: string; vendor_id: string; vendor: string };

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
  const token = (await cookies()).get(VENDOR_COOKIE)?.value;
  if (!token) return null;
  return one<VendorUser>(
    `select u.id, u.name, u.email, v.id::text as vendor_id, v.name as vendor
       from vendor_sessions s join vendor_users u on u.id = s.vendor_user_id join vendors v on v.id = u.vendor_id
      where s.id = $1 and s.expires_at > now() and u.status = 'active' and v.status = 'active'`,
    [hashToken(token)],
  );
});

export async function requireVendor(): Promise<VendorUser> {
  const v = await getVendorUser();
  if (!v) redirect("/login");
  return v;
}
