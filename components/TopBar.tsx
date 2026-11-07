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
  ];
  if (role === "lead") items.push({ href: "/team", label: "Team", icon: "team" });
  return items;
}

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export default function TopBar({ me }: { me: Me }) {
  const pathname = usePathname();
  const items = navItems(me.role);
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

  useLayoutEffect(moveThumb, [pathname, moveThumb]);
  useEffect(() => {
    window.addEventListener("resize", moveThumb);
    document.fonts?.ready.then(moveThumb).catch(() => {});
    return () => window.removeEventListener("resize", moveThumb);
  }, [moveThumb]);

  return (
    <header className="top">
      <Link className="brand" href="/" aria-label="Agthia Enhancements home">
        <Logo />
        <span className="brand-t">
          Agthia <span>Enhancements</span>
        </span>
      </Link>
      <nav className="tabs" ref={tabsRef} aria-label="Pages">
        <span className="tab-thumb" ref={thumbRef} aria-hidden="true" />
        <span className="tab-links">
          {items.map((it) => (
            <Link key={it.href} href={it.href} aria-current={isActive(pathname, it.href) ? "page" : undefined}>
              {it.label}
            </Link>
          ))}
        </span>
      </nav>
      <div className="top-r">
        <Link className="btn btn-primary btn-sm add-top" href="/add" aria-current={pathname === "/add" ? "page" : undefined}>
          <Icon name="plus" size={15} />
          Add email
        </Link>
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

  const roleLabel = me.role === "lead" ? "Lead" : "Member";
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
        <Avatar name={me.name} lead={me.role === "lead"} />
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
            <span className={`tag-st${me.role === "lead" ? " lead" : ""}`}>{roleLabel}</span>
          </div>
          <div className="menu-sep" />
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
