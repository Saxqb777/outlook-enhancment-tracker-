"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { isActive, type Badges } from "@/components/TopBar";
import type { Role } from "@/lib/auth";

type Item = { href: string; label: string; icon: IconName; badge?: number; blue?: boolean };

/** Phones have room for five: the four most used pages, and More for the rest. */
export default function BottomNav({ role, viewOnly, badges }: { role: Role; viewOnly: boolean; badges: Badges }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [pathname]);
  const approvals: Item = { href: "/approvals", label: "Approvals", icon: "sign", badge: badges.sign };
  const main: Item[] = [
    { href: "/", label: "Home", icon: "home", badge: badges.review },
    { href: "/cases", label: "Cases", icon: "cases", badge: badges.unread, blue: true },
    viewOnly ? approvals : { href: "/add", label: "Add", icon: "plus" },
    { href: "/vendors", label: "Vendors", icon: "truck", badge: badges.vendors, blue: true },
  ];
  const rest: Item[] = [{ href: "/board", label: "Board", icon: "board" }];
  if (!viewOnly) rest.push(approvals);
  if (role !== "member") rest.push({ href: "/dashboard", label: "Dashboard", icon: "chart" }, { href: "/team", label: "Team", icon: "team" });
  if (role === "admin") rest.push({ href: "/admin", label: "Admin", icon: "shield" });
  const restBadge = rest.reduce((n, it) => n + (it.badge ?? 0), 0);
  const inRest = rest.some((it) => isActive(pathname, it.href));
  const badge = (it: Item) => (it.badge ? <span className={`nav-badge${it.blue ? " blue" : ""}`}>{it.badge}</span> : null);
  return (
    <>
      {more && (
        <div className="bnav-more-wrap" onClick={() => setMore(false)}>
          <div className="bnav-more" role="menu" aria-label="More pages" onClick={(e) => e.stopPropagation()}>
            {rest.map((it) => (
              <Link key={it.href} href={it.href} role="menuitem" aria-current={isActive(pathname, it.href) ? "page" : undefined} data-tour={it.href.slice(1)}>
                <Icon name={it.icon} />
                <span>{it.label}</span>
                {badge(it)}
              </Link>
            ))}
          </div>
        </div>
      )}
      <nav className="bnav" aria-label="Pages">
        {main.map((it) => (
          <Link key={it.href} href={it.href} aria-current={isActive(pathname, it.href) ? "page" : undefined} data-tour={it.href === "/" ? "home" : it.href.slice(1)}>
            <span className="bnav-i">
              <Icon name={it.icon} />
              {badge(it)}
            </span>
            <span>{it.label}</span>
          </Link>
        ))}
        <a
          href="#more"
          role="button"
          aria-expanded={more}
          aria-current={inRest && !more ? "page" : undefined}
          data-tour="more"
          onClick={(e) => {
            e.preventDefault();
            setMore((v) => !v);
          }}
        >
          <span className="bnav-i">
            <Icon name="more" />
            {restBadge > 0 && <span className="nav-badge">{restBadge}</span>}
          </span>
          <span>More</span>
        </a>
      </nav>
    </>
  );
}
