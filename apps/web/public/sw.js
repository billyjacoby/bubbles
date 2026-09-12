/**
 * Service worker for the Bubbles PWA.
 *
 * Scope is deliberately narrow: application shell and static assets only.
 * Message data is already cached in IndexedDB by React Query, and caching it
 * twice would risk serving a stale conversation from a layer that knows nothing
 * about the sync watermark.
 *
 * Explicitly never cached:
 *   - Cross-origin requests, i.e. the BlueBubbles server itself.
 *   - /api/* — session routes carry credentials.
 */

const VERSION = "v1";
const SHELL_CACHE = `bubbles-shell-${VERSION}`;
const ASSET_CACHE = `bubbles-assets-${VERSION}`;

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bubbles — Offline</title>
<style>
  body { margin:0; height:100vh; display:flex; align-items:center; justify-content:center;
         font-family: system-ui, sans-serif; background:#0b0b0d; color:#f2f2f5; }
  div { text-align:center; }
  p { color:#8e8e98; font-size:14px; }
</style></head>
<body><div><h1>Offline</h1><p>Bubbles will reconnect when your network returns.</p></div></body>
</html>`;

self.addEventListener("install", (event) => {
  // Take over as soon as possible; there is no long-lived state to migrate.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("bubbles-") && !key.endsWith(VERSION))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Hashed build output is immutable, so it can be served from cache first. */
function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  );
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

/**
 * Fresh when possible, cached when not.
 *
 * Used for navigations so a launched PWA always shows the newest shell while
 * online, but still opens without a network.
 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const hit = await cache.match(request);
    if (hit) return hit;

    const shell = await cache.match("/chats");
    if (shell) return shell;

    return new Response(OFFLINE_HTML, {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // The BlueBubbles server is a different origin; let it through untouched.
  if (url.origin !== self.location.origin) return;

  // Session routes carry credentials and must never be stored.
  if (url.pathname.startsWith("/api/")) return;

  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE));
  }
});
