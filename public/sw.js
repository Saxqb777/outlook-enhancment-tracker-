// Shipping Tickets: shows notifications when the site is closed, and opens the right page when one is tapped.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch (_) {
    d = { body: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const looking = wins.some((c) => c.visibilityState === "visible" && c.focused);
      // On a computer with the site open and in front, the page shows its own pop-up. Safari (iPhone) must always show one.
      const mustShow = !/Chrome|Firefox|Edg\//.test(self.navigator.userAgent);
      if (looking && !mustShow) return;
      await self.registration.showNotification(d.title || "Shipping Tickets", {
        body: d.body || "",
        tag: d.tag || undefined,
        renotify: !!d.tag,
        icon: "/icon-192.png",
        badge: "/badge-96.png",
        data: { url: typeof d.url === "string" && d.url.startsWith("/") ? d.url : "/" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of wins) {
        if ("focus" in c) {
          await c.focus();
          if ("navigate" in c) await c.navigate(url).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
