// Self-destructing service worker (kill switch).
// This app no longer uses a service worker. Any browser that still has an old
// caching worker registered will fetch this file on its next update check, then
// wipe all caches, unregister itself, and reload open tabs so the fresh,
// network-served app shell loads. After that, no worker remains.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Delete every Cache Storage bucket this origin has.
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));

      // Remove this worker entirely.
      await self.registration.unregister();

      // Reload any open tabs once so they pick up the fresh app shell.
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => client.navigate(client.url));
    })()
  );
});

// Never intercept requests — always let them hit the network.
self.addEventListener('fetch', () => {});
