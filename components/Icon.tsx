const PATHS = {
  home: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6h-6v6H5.5A1.5 1.5 0 0 1 4 19z"/>',
  cases:
    '<path d="M3.5 13.5 6 5.5h12l2.5 8"/><path d="M3.5 13.5V19c0 .8.7 1.5 1.5 1.5h14c.8 0 1.5-.7 1.5-1.5v-5.5h-5l-1.5 2.5h-4l-1.5-2.5z"/>',
  board: '<rect x="3.5" y="4" width="4.6" height="16" rx="1.3"/><rect x="9.7" y="4" width="4.6" height="11" rx="1.3"/><rect x="15.9" y="4" width="4.6" height="7" rx="1.3"/>',
  team: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5"/><path d="M16 5.2a3.3 3.3 0 0 1 0 6.6M18 14.8c1.9.7 3.2 2.5 3.5 5.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.2"/><path d="M15.5 8.5V6.2c0-1-.8-1.7-1.7-1.7H6.2c-1 0-1.7.8-1.7 1.7v7.6c0 1 .8 1.7 1.7 1.7h2.3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  logout: '<path d="M14 4.5h3.5c.8 0 1.5.7 1.5 1.5v12c0 .8-.7 1.5-1.5 1.5H14"/><path d="M10 16.5 5.5 12 10 7.5M5.5 12H15"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><path d="m4 6.5 8 6 8-6"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={`i ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: PATHS[name] }}
    />
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      <rect x="1" y="1" width="24" height="24" rx="7" fill="#11161F" />
      <rect x="6.5" y="7" width="13" height="2" rx="1" fill="#FFFFFF" opacity=".5" />
      <rect x="5.5" y="11.3" width="15" height="4" rx="1.4" fill="#FFD21F" />
      <rect x="6.8" y="12.6" width="9" height="1.5" rx=".75" fill="#11161F" />
      <rect x="6.5" y="17.3" width="8.5" height="2" rx="1" fill="#FFFFFF" opacity=".5" />
    </svg>
  );
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function Avatar({ name, lead = false, size = "md" }: { name: string; lead?: boolean; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`av av-${size}${lead ? " lead" : ""}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
