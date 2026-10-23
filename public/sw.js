// Night Hunt service worker: makes the app installable, keeps a fallback page for dead zones,
// and shows push notifications (pings, captures, flash missions).
const CACHE = "nighthunt-v4";
const SHELL = ["/offline.html", "/icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Pages: always try the network (game state must be live), fall back to the offline page.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }
  // Build assets are content-hashed and never change: cache first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/maplibre/") || url.pathname.startsWith("/lottie/") || url.pathname.startsWith("/animations/")) {
    e.respondWith(
      caches.match(req).then(
        (hit) => hit || fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
      ),
    );
  }
});

self.addEventListener("push", (e) => {
  let data = { title: "Night Hunt", body: "", tag: "cnh" };
  try { data = { ...data, ...e.data.json() }; } catch {}
  // An SOS stays on screen until it's touched and buzzes long.
  const sos = data.tag === "sos";
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      // Chat messages share a tag per chat, so they stack instead of piling up; renotify still buzzes for each one.
      renotify: true,
      requireInteraction: sos,
      vibrate: sos ? [700, 200, 700, 200, 700, 200, 700] : [120, 60, 120],
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      data: { tab: String(data.tag).startsWith("chat-") ? "comms" : null },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const tab = e.notification.data?.tab;
      const open = list.find((c) => "focus" in c);
      if (open) {
        if (tab) open.postMessage({ type: "open-tab", tab });
        return open.focus();
      }
      return self.clients.openWindow(tab ? `/?tab=${tab}` : "/");
    }),
  );
});
