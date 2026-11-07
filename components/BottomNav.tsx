"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { isActive, navItems } from "@/components/TopBar";
import type { Role } from "@/lib/auth";

function bottomItems(role: Role, viewOnly: boolean): { href: string; label: string; icon: IconName }[] {
  const items = navItems(role);
  if (!viewOnly) items.splice(2, 0, { href: "/add", label: "Add", icon: "plus" });
  return items;
}

export default function BottomNav({ role, viewOnly }: { role: Role; viewOnly: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="bnav" aria-label="Pages">
      {bottomItems(role, viewOnly).map((it) => (
        <Link key={it.href} href={it.href} aria-current={isActive(pathname, it.href) ? "page" : undefined}>
          <Icon name={it.icon} />
          <span>{it.label}</span>
        </Link>
      ))}
    </nav>
  );
}
