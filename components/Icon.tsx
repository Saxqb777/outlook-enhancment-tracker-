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
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4 14.5V19c0 .8.7 1.5 1.5 1.5h13c.8 0 1.5-.7 1.5-1.5v-4.5"/>',
  scan: '<path d="M4 8V5.5C4 4.7 4.7 4 5.5 4H8M16 4h2.5c.8 0 1.5.7 1.5 1.5V8M20 16v2.5c0 .8-.7 1.5-1.5 1.5H16M8 20H5.5c-.8 0-1.5-.7-1.5-1.5V16M7.5 12h9"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  more: '<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>',
  dot: '<circle cx="12" cy="12" r="2.2"/>',
  undo: '<path d="M9 7 4.5 11.5 9 16"/><path d="M5 11.5h9.5a5 5 0 0 1 0 10H11"/>',
  cal: '<rect x="4" y="5.5" width="16" height="15" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  flag: '<path d="M5.5 21V4.5h11l-2 4 2 4h-11"/>',
  msg: '<path d="M4.5 5.5h15v10h-9l-4.5 4v-4h-1.5z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  chat: '<path d="M20 12a7.5 7.5 0 0 1-11 6.6L4 20l1.4-4.6A7.5 7.5 0 1 1 20 12z"/>',
  spark: '<path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18l-1.8-5.4L4.5 10.8 10.2 9z"/><path d="M19 16.5v4M17 18.5h4"/>',
  help: '<circle cx="12" cy="12" r="8.6"/><path d="M9.7 9.4a2.4 2.4 0 0 1 4.7.8c0 1.7-2.4 2.1-2.4 3.6"/><path d="M12 16.9v.1"/>',
  send: '<path d="M4.5 12 20 4.5 15.5 20l-3-6.5z"/><path d="m12.5 13.5 3-3"/>',
  clip: '<path d="m20 11.5-8.2 8.2a5 5 0 0 1-7-7l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.3-2.3l7.9-7.9"/>',
  reply: '<path d="M10 8 5 12.5l5 4.5"/><path d="M5.5 12.5H14a5 5 0 0 1 5 5V19"/>',
  file: '<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  shield: '<path d="M12 3.5 5 6v5.5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6z"/>',
  sign: '<path d="M3.5 20.5h17"/><path d="M4.5 16.5c2.6-6.5 4.7-9.8 6.2-9.8 1.9 0-1 8 1.3 8 1.6 0 2-4.2 3.6-4.2 1.4 0 1 3.2 3.9 3.2"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4 14.5V19c0 .8.7 1.5 1.5 1.5h13c.8 0 1.5-.7 1.5-1.5v-4.5"/>',
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

export function Avatar({ name, lead = false, size = "md" }: { name: string; lead?: boolean; size?: "xs" | "sm" | "md" | "lg" }) {
  return (
    <span className={`av av-${size}${lead ? " lead" : ""}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
