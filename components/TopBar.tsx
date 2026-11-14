"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { logout } from "@/app/actions/auth";
import { Avatar, Icon, Logo, type IconName } from "@/components/Icon";
import type { Role } from "@/lib/auth";

type Me = { name: string; email: string; role: Role };

export function navItems(role: Role): { href: string; label: string; icon: IconName }[] {
  const items: { href: string; label: string; icon: IconName }[] = [
    { href: "/", label: "Home", icon: "home" },
    { href: "/cases", label: "Cases", icon: "cases" },
    { href: "/board", label: "Board", icon: "board" },
    { href: "/approvals", label: "Approvals", icon: "sign" },
    { href: "/vendors", label: "Vendors", icon: "truck" },
  ];
  if (role === "lead" || role === "admin") items.push({ href: "/dashboard", label: "Dashboard", icon: "chart" });
  // Team lives in the menu under your name, to keep the bar short.
  if (role === "admin") items.push({ href: "/admin", label: "Admin", icon: "shield" });
  return items;
}

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export type Badges = { review: number; unread: number; sign: number; vendors: number };

export default function TopBar({ me, navRole, viewOnly, badges }: { me: Me; navRole: Role; viewOnly: boolean; badges: Badges }) {
  const pathname = usePathname();
  const items = navItems(navRole);
  const tabsRef = useRef<HTMLElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  const moveThumb = useCallback(() => {
    const tabs = tabsRef.current;
    const thumb = thumbRef.current;
    if (!tabs || !thumb) return;
    const active = tabs.querySelector<HTMLAnchorElement>('a[aria-current="page"]');
    if (!active || getComputedStyle(tabs).display === "none") {
      thumb.style.opacity = "0";
      return;
    }
    if (!placed.current) thumb.style.transition = "none";
    thumb.style.opacity = "1";
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.transform = `translateX(${active.offsetLeft}px)`;
    if (!placed.current) {
      void thumb.offsetWidth;
      thumb.style.transition = "";
      placed.current = true;
    }
  }, []);

  // Badges change the width of a tab, so the highlight is measured again when they do.
  useLayoutEffect(moveThumb, [pathname, moveThumb, badges.review, badges.unread, badges.sign, badges.vendors]);
  useEffect(() => {
    window.addEventListener("resize", moveThumb);
    document.fonts?.ready.then(moveThumb).catch(() => {});
    return () => window.removeEventListener("resize", moveThumb);
  }, [moveThumb]);

  return (
    <header className="top">
      <Link className="brand" href="/" aria-label="Shipping Tickets home">
        <Logo />
        <span className="brand-t">
          Shipping Tickets
        </span>
      </Link>
      <nav className="tabs" ref={tabsRef} aria-label="Pages">
        <span className="tab-thumb" ref={thumbRef} aria-hidden="true" />
        <span className="tab-links">
          {items.map((it) => (
            <Link key={it.href} href={it.href} aria-current={isActive(pathname, it.href) ? "page" : undefined} data-tour={it.href === "/" ? "home" : it.href.slice(1)}>
              {it.label}
              {it.href === "/vendors" && badges.vendors > 0 && <span className="nav-badge blue" title={`${badges.vendors} new from vendors`}>{badges.vendors}</span>}
              {it.href === "/approvals" && badges.sign > 0 && <span className="nav-badge" title={`${badges.sign} waiting for your signature`}>{badges.sign}</span>}
              {it.href === "/" && badges.review > 0 && <span className="nav-badge" title={`${badges.review} waiting for approval`}>{badges.review}</span>}
              {it.href === "/cases" && badges.unread > 0 && <span className="nav-badge blue" title={`${badges.unread} new chat messages`}>{badges.unread}</span>}
            </Link>
          ))}
        </span>
      </nav>
      <div className="top-r">
        <form className="top-find" action="/cases" role="search" data-tour="search">
          <Icon name="search" size={15} />
          <input name="q" type="search" placeholder="Search cases, BL, container…" aria-label="Search cases" autoComplete="off" />
        </form>
        {!viewOnly && (
          <Link className="btn btn-primary btn-sm add-top" data-tour="add" href="/add" aria-current={pathname === "/add" ? "page" : undefined}>
            <Icon name="plus" size={15} />
            Add email
          </Link>
        )}
        <UserMenu me={me} />
      </div>
    </header>
  );
}

function UserMenu({ me }: { me: Me }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const roleLabel = me.role === "lead" ? "Lead" : me.role === "admin" ? "Admin · view only" : "Member";
  return (
    <div className="me-wrap" ref={wrap}>
      <button
        ref={button}
        className="me"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={`${me.name}, ${roleLabel}`}
      >
        <Avatar name={me.name} lead={me.role !== "member"} />
        <span className="me-t">
          <b>{me.name}</b>
          <span>{roleLabel}</span>
        </span>
        <Icon name="chevD" size={14} className="me-chev" />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-who">
            <b>{me.name}</b>
            <span>{me.email}</span>
            <span className={`tag-st${me.role === "lead" ? " lead" : me.role === "admin" ? " admin" : ""}`}>{roleLabel}</span>
          </div>
          <div className="menu-sep" />
          <Link className="mi" role="menuitem" href="/account" onClick={() => setOpen(false)}>
            <Icon name="lock" size={16} />
            Change password
          </Link>
          {me.role !== "member" && (
            <Link className="mi" role="menuitem" href="/team" onClick={() => setOpen(false)}>
              <Icon name="team" size={16} />
              Team
            </Link>
          )}
          {me.role === "admin" && (
            <Link className="mi" role="menuitem" href="/admin" onClick={() => setOpen(false)}>
              <Icon name="shield" size={16} />
              Admin
            </Link>
          )}
          <form action={logout}>
            <button className="mi" role="menuitem" type="submit">
              <Icon name="logout" size={16} />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
