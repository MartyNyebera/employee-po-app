// Service Worker for Fleet Manager Pro PWA
const CACHE_VERSION = '3'; 
const CACHE_NAME = `kimoel-v${CACHE_VERSION}-${
  typeof __CACHE_BUST__ !== 'undefined' 
    ? __CACHE_BUST__ 
    : Date.now()
}`;
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Force this service worker to become active immediately
  // without waiting for old one to expire
  self.skipWaiting();
});

// Activate - clean old caches and take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Delete ALL old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      }),
      // Take control of ALL open tabs immediately
      // without requiring a page refresh
      self.clients.claim()
    ])
  );
});

// When new service worker activates, tell ALL open 
// tabs to reload automatically
self.addEventListener('activate', () => {
  self.clients.matchAll({ 
    type: 'window',
    includeUncontrolled: true 
  }).then((clients) => {
    clients.forEach((client) => {
      // Send message to each open tab to reload
      client.postMessage({ type: 'RELOAD_PAGE' });
    });
  });
});

// Update fetch to use cache-first for assets, 
// network-first for API:
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Always network-first for API calls
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => response)
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});

// Listen for skip waiting message from app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
