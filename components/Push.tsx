"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/work";

type State = "checking" | "unsupported" | "needs-install" | "off" | "on" | "blocked";

const keyBytes = (b64: string) => {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const installed = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};
const save = (sub: PushSubscription) => fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) }).then((r) => r.ok);

/** Notifications for this browser or phone: what state they are in, and how to switch them on or off. */
export function usePush(publicKey: string) {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    (async () => {
      if (!publicKey) return setState("unsupported");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") return setState(isIos() && !installed() ? "needs-install" : "unsupported");
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        if (stop) return;
        if (Notification.permission === "denied") return setState("blocked");
        let sub = await reg.pushManager.getSubscription();
        // Allowed before on this device: keep it going without asking again (unless they switched it off here).
        if (!sub && Notification.permission === "granted" && !store.get("push-off")) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
        if (sub && Notification.permission === "granted") {
          const ok = await save(sub);
          if (!stop) setState(ok ? "on" : "off");
        } else if (!stop) setState("off");
      } catch {
        if (!stop) setState("off");
      }
    })();
    return () => {
      stop = true;
    };
  }, [publicKey]);

  useEffect(() => {
    (window as unknown as { __pushOn?: boolean }).__pushOn = state === "on";
  }, [state]);

  const turnOn = useCallback(async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "blocked" : "off");
        return false;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const ok = await save(sub);
      store.set("push-off", null);
      setState(ok ? "on" : "off");
      if (!ok) toast("Notifications could not be switched on. Try again.");
      return ok;
    } catch {
      toast("Notifications could not be switched on in this browser.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [publicKey]);

  const turnOff = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      store.set("push-off", "1");
      setState("off");
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, turnOn, turnOff };
}

const INSTALL = "On iPhone: open this site in Safari, press Share, then \"Add to Home Screen\". Open it from the new icon and switch notifications on there.";

/** A small card that offers notifications once. After "Not now" it stays away; the switch lives on My account. */
export function PushAsk({ publicKey }: { publicKey: string }) {
  const { state, busy, turnOn } = usePush(publicKey);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if ((state !== "off" && state !== "needs-install") || store.get("push-ask")) return;
    const t = setTimeout(() => setShow(true), 3500);
    return () => clearTimeout(t);
  }, [state]);
  if (!show || (state !== "off" && state !== "needs-install")) return null;
  const done = () => (store.set("push-ask", "1"), setShow(false));
  return (
    <div className="push-ask no-print" role="dialog" aria-label="Notifications">
      <Icon name="bell" size={20} />
      <span className="push-ask-t">
        <b>Get notified on this {state === "needs-install" ? "iPhone" : "device"}?</b>
        {state === "needs-install" ? INSTALL : "Messages, approvals and updates that are for you, even when the site is closed."}
      </span>
      {state === "off" && (
        <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={async () => ((await turnOn()) && toast("Notifications are on for this device."), done())}>
          Turn on
        </button>
      )}
      <button type="button" className="btn btn-sm btn-ghost" onClick={done}>
        {state === "off" ? "Not now" : "OK"}
      </button>
    </div>
  );
}

/** The switch on the account page, with a test button. */
export function PushCard({ publicKey }: { publicKey: string }) {
  const { state, busy, turnOn, turnOff } = usePush(publicKey);
  const [testing, setTesting] = useState(false);
  const test = async () => {
    setTesting(true);
    const r = await fetch("/api/push", { method: "PUT" }).then((x) => x.json()).catch(() => null);
    toast(r?.ok ? "Sent. It should arrive in a few seconds." : (r?.error ?? "The test could not be sent."));
    setTesting(false);
  };
  const text: Record<State, [string, string]> = {
    checking: ["Checking…", ""],
    on: ["On for this device", "You get a notification for messages, approvals and updates that are for you, also when the site is closed."],
    off: ["Off for this device", "Switch on to hear about messages, approvals and updates that are for you, also when the site is closed."],
    blocked: ["Blocked in this browser", "Notifications were refused for this site. Open the browser's site settings (the icon left of the address), allow Notifications, then reload."],
    "needs-install": ["Add the site to your Home Screen first", INSTALL],
    unsupported: ["Not available in this browser", "Use Chrome, Edge, Firefox or Safari. On iPhone, add the site to your Home Screen first."],
  };
  return (
    <div className="push-card">
      <Icon name="bell" size={22} />
      <span className="push-t">
        <b>{text[state][0]}</b>
        <span>{text[state][1]}</span>
      </span>
      {state === "off" && (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => turnOn().then((ok) => ok && toast("Notifications are on for this device."))}>
          Turn on
        </button>
      )}
      {state === "on" && (
        <>
          <button type="button" className="btn" disabled={testing} onClick={test}>
            {testing ? "Sending…" : "Send me a test"}
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={turnOff}>
            Turn off
          </button>
        </>
      )}
    </div>
  );
}
