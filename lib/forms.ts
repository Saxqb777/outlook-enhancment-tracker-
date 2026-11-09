export type FormState = { error?: string; fields?: Record<string, string> } | undefined;

export type InviteState =
  | { error?: string; link?: string; name?: string; email?: string; role?: "lead" | "member"; fields?: Record<string, string> }
  | undefined;

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const cleanName = (v: FormDataEntryValue | null) => String(v ?? "").trim().replace(/\s+/g, " ");
export const cleanEmail = (v: FormDataEntryValue | null) => String(v ?? "").trim().toLowerCase();
export const isEmail = (v: string) => v.length <= 254 && EMAIL_RX.test(v);

export const MIN_PASSWORD = 10;

export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters for the password.`;
  if (password.length > 200) return "That password is too long. Use 200 characters or fewer.";
  if (password !== confirm) return "The two passwords don't match.";
  return null;
}

export function nameProblem(name: string): string | null {
  if (name.length < 2) return "Enter a name.";
  if (name.length > 80) return "Keep the name under 80 characters.";
  return null;
}
