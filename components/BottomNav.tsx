"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { isActive, navItems } from "@/components/TopBar";
import type { Role } from "@/lib/auth";

export default function BottomNav({ role }: { role: Role }) {
  const pathname = usePathname();
  return (
    <nav className="bnav" aria-label="Pages">
      {navItems(role).map((it) => (
        <Link key={it.href} href={it.href} aria-current={isActive(pathname, it.href) ? "page" : undefined}>
          <Icon name={it.icon} />
          <span>{it.label}</span>
        </Link>
      ))}
    </nav>
  );
}
