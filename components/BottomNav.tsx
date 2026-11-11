"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { isActive, navItems, type Badges } from "@/components/TopBar";
import type { Role } from "@/lib/auth";

function bottomItems(role: Role, viewOnly: boolean): { href: string; label: string; icon: IconName }[] {
  // Phones have room for five: Team moves to the user menu when there's a Dashboard.
  const items = navItems(role).filter((it) => it.href !== "/team" && it.href !== "/admin");
  if (!viewOnly) items.splice(2, 0, { href: "/add", label: "Add", icon: "plus" });
  return items.map((it) => (it.href === "/dashboard" ? { ...it, label: "Stats" } : it));
}

export default function BottomNav({ role, viewOnly, badges }: { role: Role; viewOnly: boolean; badges: Badges }) {
  const pathname = usePathname();
  return (
    <nav className="bnav" aria-label="Pages">
      {bottomItems(role, viewOnly).map((it) => (
        <Link key={it.href} href={it.href} aria-current={isActive(pathname, it.href) ? "page" : undefined} data-tour={it.href === "/" ? "home" : it.href.slice(1)}>
          <span className="bnav-i">
            <Icon name={it.icon} />
            {it.href === "/" && badges.review > 0 && <span className="nav-badge">{badges.review}</span>}
            {it.href === "/cases" && badges.unread > 0 && <span className="nav-badge blue">{badges.unread}</span>}
          </span>
          <span>{it.label}</span>
        </Link>
      ))}
    </nav>
  );
}
