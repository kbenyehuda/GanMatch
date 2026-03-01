/* eslint-disable no-restricted-globals */

const CACHE_NAME = "ganmatch-pwa-v1";
const CORE_ASSETS = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(CORE_ASSETS);
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE_NAME ? Promise.resolve() : caches.delete(k))));
      self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Always bypass for Next.js internal requests.
  const url = new URL(req.url);
  if (url.pathname.startsWith("/_next/")) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;

      try {
        const res = await fetch(req);
        // Cache successful same-origin navigations + basic assets.
        if (res.ok && url.origin === self.location.origin) {
          cache.put(req, res.clone()).catch(() => {});
        }
        return res;
      } catch (e) {
        // Minimal offline fallback.
        return (
          cached ||
          new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }
    })()
  );
});

