const CACHE_NAME = "claude-code-v6";
const PRECACHE = ["/", "/style.css", "/app.js", "/vendor/lucide.min.js", "/manifest.json", "/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE).catch(() => {
        // Fallback: add items one by one in case some fail
        return Promise.all(
          PRECACHE.map(url =>
            cache.add(url).catch(() => console.warn(`Failed to cache ${url}`))
          )
        );
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Handle notifications if supported
self.addEventListener("push", (e) => {
  const data = e.data ? e.data.json() : {};
  const options = {
    body: data.body || "New message",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "claude-notification",
  };
  self.registration.showNotification(data.title || "Claude Code", options);
});

self.addEventListener("fetch", (e) => {
  // Skip WebSocket and API requests
  if (
    e.request.url.includes("/api/") ||
    e.request.url.startsWith("ws")
  ) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        return res;
      })
      .catch(() => {
        // For offline, try cache
        return caches.match(e.request).then(cached => {
          return cached || new Response("Offline - content not available", { status: 503 });
        });
      })
  );
});
