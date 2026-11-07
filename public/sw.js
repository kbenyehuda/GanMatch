/* eslint-disable no-restricted-globals */

// v3 (2026-11-07): v2 kept every non-page GET forever, cache-first — including /api answers
// (place lists, recommendations, a person's owner status) and Next.js navigation data. New
// deploys and new data only showed after Ctrl+Shift+R, and personal answers stayed in the
// browser. Now: pages are network-first (cached copy only offline), static images refresh in
// the background, and everything else (/api, /_next, Next data, other sites) is never touched.
// The new name makes every browser delete the old v2 copies on activate.
const CACHE_NAME = "ganmatch-pwa-v3";
const CORE_ASSETS = ["/manifest.webmanifest"];
const STATIC_FILE = /\.(png|jpe?g|gif|svg|webp|avif|ico|webmanifest|woff2?)$/i;

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
      // Only our own old caches (mapbox-tiles belongs to the map library)
      await Promise.all(keys.filter((k) => k.startsWith("ganmatch-pwa") && k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Data and app code always come from the network (and the browser's normal HTTP cache).
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/")) return;
  if (url.searchParams.has("_rsc") || req.headers.get("RSC")) return;
  // Video uses range requests (206); let the browser stream it directly.
  if (url.pathname.startsWith("/video/")) return;

  // Pages: network-first; the saved copy is only for when there's no connection.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, res.clone()).catch(() => {});
          }
          return res;
        } catch {
          const cached = await caches.match(req);
          return (
            cached ||
            new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })
          );
        }
      })()
    );
    return;
  }

  // Static images / icons / fonts: show the saved copy at once, refresh it in the background.
  if (STATIC_FILE.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        const fresh = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone()).catch(() => {});
            return res;
          })
          .catch(() => cached);
        return cached || fresh;
      })()
    );
  }
  // Anything else: not handled, the browser fetches it normally.
});
