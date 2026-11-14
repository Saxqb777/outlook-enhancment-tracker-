"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "@/components/work";
import type { Role } from "@/lib/auth";

/** The list shown in the ? help. Keep it in step with the keys handled below. */
export const SHORTCUTS: [string, string][] = [
  ["/", "Jump to search"],
  ["N", "New: add an email (New request on Vendors and Approvals)"],
  ["G then H C B A V D", "Go to Home, Cases, Board, Approvals, Vendors, Dashboard"],
  ["↑ ↓ then Enter", "Move through a list and open a row"],
  ["C", "On a case: open the chat"],
  ["R", "On a case: add a reply"],
  ["E", "On a vendor request: edit it"],
  ["Enter", "In a chat: send (Shift + Enter for a new line)"],
  ["Ctrl + Enter", "In a pop-up box: press its main button"],
  ["Esc", "Close a pop-up box"],
  ["?", "Open this help"],
];
export const PORTAL_SHORTCUTS: [string, string][] = [
  ["↑ ↓ then Enter", "Move through your requests and open one"],
  ["Enter", "In the chat: send (Shift + Enter for a new line)"],
  ["Ctrl + Enter", "In a pop-up box: press its main button"],
  ["Esc", "Close a pop-up box"],
];

const visible = (el: Element | null): el is HTMLElement => !!el && el instanceof HTMLElement && el.offsetParent !== null && !(el as HTMLButtonElement).disabled;
const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

/**
 * Keyboard shortcuts. Single keys never fire while someone is typing or while a pop-up box is open,
 * and nothing that matters (approve, award, sign, remove) has a single-key shortcut.
 * A button can opt in with data-key="x": pressing X clicks it.
 */
export default function Shortcuts({ role, viewOnly = false, portal = false }: { role?: Role; viewOnly?: boolean; portal?: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const goAt = useRef(0);

  useEffect(() => {
    const GO: Record<string, string> = { h: "/", c: "/cases", b: "/board", a: "/approvals", v: "/vendors", ...(role && role !== "member" ? { d: "/dashboard", t: "/team" } : {}) };
    const onKey = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll<HTMLElement>(".dialog");
      const dialog = dialogs[dialogs.length - 1];

      // Ctrl (or Cmd) + Enter: the main button of the open pop-up box.
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        if (!dialog) return;
        const main = [...dialog.querySelectorAll<HTMLElement>(".form-f .btn-primary, button[type=submit].btn-primary")].find(visible);
        if (main) {
          e.preventDefault();
          main.click();
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if (dialog || document.querySelector(".help-wrap, .tour, .bnav-more")) return;

      // Arrow keys walk the rows of a list; Enter then opens the row (it is a link).
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (typing(e.target) && (e.target as HTMLElement).tagName !== "INPUT") return;
        if ((e.target as HTMLElement | null)?.closest?.(".pop, .menu, select")) return;
        const rows = [...document.querySelectorAll<HTMLElement>("main a.crow, main a.aprow")].filter(visible);
        if (!rows.length) return;
        const at = rows.indexOf(document.activeElement as HTMLElement);
        if (at < 0 && typing(e.target) && e.key === "ArrowUp") return;
        const next = rows[Math.max(0, Math.min(rows.length - 1, at < 0 ? 0 : at + (e.key === "ArrowDown" ? 1 : -1)))];
        e.preventDefault();
        next.focus();
        next.scrollIntoView({ block: "nearest" });
        return;
      }
      if (typing(e.target)) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      if (!portal && Date.now() - goAt.current < 1500) {
        goAt.current = 0;
        if (GO[k]) {
          e.preventDefault();
          router.push(GO[k]);
        }
        return;
      }
      if (k === "/") {
        const box = [...document.querySelectorAll<HTMLElement>(".top-find input, main .find input")].find(visible);
        if (box) {
          e.preventDefault();
          box.focus();
        }
        return;
      }
      if (portal) return;
      if (k === "?") {
        e.preventDefault();
        document.querySelector<HTMLElement>('[data-tour="help"]')?.click();
        return;
      }
      if (k === "g") {
        goAt.current = Date.now();
        toast(`Go to: H Home · C Cases · B Board · A Approvals · V Vendors${GO.d ? " · D Dashboard" : ""}`);
        return;
      }
      if (/^[a-z]$/.test(k)) {
        // A button on the page that asked for this key (the page's own one wins over the top bar's).
        const el = [...document.querySelectorAll<HTMLElement>(`main [data-key="${k}"]`)].find(visible) ?? [...document.querySelectorAll<HTMLElement>(`[data-key="${k}"]`)].find(visible);
        if (el) {
          e.preventDefault();
          el.click();
        } else if (k === "n" && !viewOnly) {
          e.preventDefault();
          router.push("/add");
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router, role, viewOnly, portal, path]);
  return null;
}

/** A small key label shown next to the thing the key works on. Hidden on phones and tablets. */
export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}
/** "↑ ↓ to move, Enter to open", shown beside a list's filters. */
export function ListKeys() {
  return (
    <span className="kbd-hint" aria-hidden="true">
      <kbd className="kbd">↑</kbd>
      <kbd className="kbd">↓</kbd>
      move
      <kbd className="kbd">Enter</kbd>
      open
    </span>
  );
}
