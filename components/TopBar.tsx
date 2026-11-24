"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { logout } from "@/app/actions/auth";
import { Avatar, Icon, Logo, type IconName } from "@/components/Icon";
import type { Role } from "@/lib/auth";

type Me = { name: string; email: string; role: Role };

export function navItems(role: Role, rates = false, docs = false): { href: string; label: string; icon: IconName }[] {
  const items: { href: string; label: string; icon: IconName }[] = [
    { href: "/", label: "Home", icon: "home" },
    { href: "/cases", label: "Cases", icon: "cases" },
    { href: "/board", label: "Board", icon: "board" },
    { href: "/approvals", label: "Approvals", icon: "sign" },
    { href: "/vendors", label: "Vendors", icon: "truck" },
  ];
  if (rates) items.push({ href: "/rates", label: "Rates", icon: "rates" });
  if (docs) items.push({ href: "/docs", label: "Docs", icon: "folder" });
  if (role === "lead" || role === "admin") items.push({ href: "/dashboard", label: "Dashboard", icon: "chart" });
  // Team lives in the menu under your name, to keep the bar short.
  if (role === "admin") items.push({ href: "/admin", label: "Admin", icon: "shield" });
  return items;
}

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export type Badges = { review: number; unread: number; sign: number; vendors: number };

export default function TopBar({ me, navRole, viewOnly, badges, rates = false, docs = false }: { me: Me; navRole: Role; viewOnly: boolean; badges: Badges; rates?: boolean; docs?: boolean }) {
  const pathname = usePathname();
  const items = navItems(navRole, rates, docs);
  const tabsRef = useRef<HTMLElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);
  const topRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  // How many menu items fit in the bar. The rest go under "More", so nothing is ever cut off.
  const [fit, setFit] = useState(items.length);
  const [more, setMore] = useState(false);

  const moveThumb = useCallback(() => {
    const tabs = tabsRef.current;
    const thumb = thumbRef.current;
    if (!tabs || !thumb) return;
    const active = tabs.querySelector<HTMLElement>('.tab-links > [aria-current="page"]');
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

  const measure = useCallback(() => {
    const top = topRef.current;
    const tabs = tabsRef.current;
    const m = measureRef.current;
    if (!top || !tabs || !m || getComputedStyle(tabs).display === "none") return;
    const cs = getComputedStyle(top);
    const gap = parseFloat(cs.columnGap || cs.gap) || 12;
    let others = 0;
    let n = 0;
    for (const el of Array.from(top.children) as HTMLElement[]) {
      if (getComputedStyle(el).display === "none") continue;
      n++;
      if (el !== tabs) others += el.offsetWidth;
    }
    // The search box can shrink to 120px before the menu has to give anything up.
    const find = top.querySelector<HTMLElement>(".top-find");
    if (find && getComputedStyle(find).display !== "none") others -= Math.max(0, find.offsetWidth - 120);
    const room = top.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - others - gap * Math.max(0, n - 1) - 36;
    const widths = (Array.from(m.children) as HTMLElement[]).map((el) => el.offsetWidth + 2);
    const all = widths.reduce((a, b) => a + b, 0);
    if (all <= room) return setFit(widths.length);
    let used = 86; // the "More" button
    let k = 0;
    while (k < widths.length && used + widths[k] <= room) used += widths[k++];
    setFit(Math.max(1, k));
  }, []);

  // Badges change the width of a tab, so the fit and the highlight are measured again when they do.
  useLayoutEffect(measure, [measure, items.length, viewOnly, badges.review, badges.unread, badges.sign, badges.vendors]);
  useLayoutEffect(moveThumb, [pathname, moveThumb, fit, badges.review, badges.unread, badges.sign, badges.vendors]);
  useEffect(() => {
    const again = () => (measure(), moveThumb());
    window.addEventListener("resize", again);
    document.fonts?.ready.then(again).catch(() => {});
    return () => window.removeEventListener("resize", again);
  }, [measure, moveThumb]);
  useEffect(() => setMore(false), [pathname]);
  useEffect(() => {
    if (!more) return;
    const down = (e: MouseEvent) => !(e.target as HTMLElement).closest?.(".tab-more-wrap") && setMore(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMore(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [more]);

  const badgeOf = (href: string) => (
    <>
      {href === "/vendors" && badges.vendors > 0 && <span className="nav-badge blue" title={`${badges.vendors} new from vendors`}>{badges.vendors}</span>}
      {href === "/approvals" && badges.sign > 0 && <span className="nav-badge" title={`${badges.sign} waiting for your signature`}>{badges.sign}</span>}
      {href === "/" && badges.review > 0 && <span className="nav-badge" title={`${badges.review} waiting for approval`}>{badges.review}</span>}
      {href === "/cases" && badges.unread > 0 && <span className="nav-badge blue" title={`${badges.unread} new chat messages`}>{badges.unread}</span>}
    </>
  );
  const shown = items.slice(0, fit);
  const rest = items.slice(fit);
  const restActive = rest.some((it) => isActive(pathname, it.href));

  return (
    <header className="top" ref={topRef}>
      <Link className="brand" href="/" aria-label="Shipping Tickets home">
        <Logo />
        <span className="brand-t">
          Shipping Tickets
        </span>
      </Link>
      <nav className="tabs" ref={tabsRef} aria-label="Pages">
        <span className="tab-thumb" ref={thumbRef} aria-hidden="true" />
        <span className="tab-measure" ref={measureRef} aria-hidden="true">
          {items.map((it) => (
            <a key={it.href} tabIndex={-1}>
              {it.label}
              {badgeOf(it.href)}
            </a>
          ))}
        </span>
        <span className="tab-links">
          {shown.map((it) => (
            <Link key={it.href} href={it.href} aria-current={isActive(pathname, it.href) ? "page" : undefined} data-tour={it.href === "/" ? "home" : it.href.slice(1)} title={it.href === "/admin" || it.href === "/rates" || it.href === "/docs" ? undefined : `Shortcut: G then ${it.label[0]}`}>
              {it.label}
              {badgeOf(it.href)}
            </Link>
          ))}
          {rest.length > 0 && (
            <button type="button" className="tab-more tab-more-wrap" aria-haspopup="menu" aria-expanded={more} aria-current={restActive ? "page" : undefined} onClick={() => setMore((v) => !v)} data-tour={rest.map((it) => it.href.slice(1)).join(" ")}>
              {restActive ? rest.find((it) => isActive(pathname, it.href))!.label : "More"}
              <span aria-hidden="true">▾</span>
            </button>
          )}
        </span>
        {rest.length > 0 && more && (
          <span className="menu tab-more-menu tab-more-wrap" role="menu">
            {rest.map((it) => (
              <Link key={it.href} role="menuitem" href={it.href} aria-current={isActive(pathname, it.href) ? "page" : undefined} onClick={() => setMore(false)}>
                {it.label}
                {badgeOf(it.href)}
              </Link>
            ))}
          </span>
        )}
      </nav>
      <div className="top-r">
        <form className="top-find" action="/cases" role="search" data-tour="search">
          <Icon name="search" size={15} />
          <input name="q" type="search" placeholder="Search cases, BL, container…" aria-label="Search cases" autoComplete="off" />
          <kbd className="kbd">/</kbd>
        </form>
        {!viewOnly && (
          <Link className="btn btn-primary btn-sm add-top" data-tour="add" data-key="n" href="/add" aria-current={pathname === "/add" ? "page" : undefined}>
            <Icon name="plus" size={15} />
            Add email
            <kbd className="kbd">N</kbd>
          </Link>
        )}
        <UserMenu me={me} viewOnly={viewOnly} />
      </div>
    </header>
  );
}

function UserMenu({ me, viewOnly }: { me: Me; viewOnly: boolean }) {
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

  const roleLabel = me.role === "lead" ? "Lead" : me.role === "admin" ? (viewOnly ? "Admin · view only" : "Admin · acting as someone") : "Member";
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
