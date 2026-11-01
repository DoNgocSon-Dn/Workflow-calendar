/* Service worker — Web Push, Offline Caching & Background Sync */

const CACHE_NAME = 'workflow-cache-v2';
const IS_NATIVE = self.location.origin === 'https://localhost';
const STATIC_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/screenshot-1.png',
  '/screenshot-2.png'
];

self.addEventListener('install', (event) => {
  if (IS_NATIVE) { event.waitUntil(self.skipWaiting()); return; }
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key.startsWith('workflow-cache-') && (IS_NATIVE || key !== CACHE_NAME)).map((key) => caches.delete(key))
      );
    }).then(async () => {
      if (!IS_NATIVE) { await self.clients.claim(); return; }
      // Migrate APKs that registered the old cache worker without clearing
      // sessions, notes or the per-account calendar snapshot.
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      await Promise.all(clients.filter(client => new URL(client.url).origin === self.location.origin)
        .map(client => client.navigate(client.url).catch(() => {})));
    })
  );
});

// A fresh HTML shell must reference chunks from the same deployment.
self.addEventListener('fetch', (event) => {
  if (IS_NATIVE || event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Skip API & Supabase calls from static cache
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api') || url.pathname === '/runtime-config.js') {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(async response => {
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put('/', response.clone());
      }
      return response;
    }).catch(async () => (await caches.match('/')) || Response.error()));
    return;
  }
  if (!['script', 'style', 'image', 'font'].includes(event.request.destination)) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(async response => {
    // Never cache an HTML rewrite as a JavaScript module.
    const html = (response.headers.get('content-type') || '').includes('text/html');
    if (response.ok && !html) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(event.request, response.clone());
    }
    return response;
  })));
});

// Background Sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-events') {
    event.waitUntil(Promise.resolve());
  }
});

// Periodic Background Sync
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-calendar-cache') {
    event.waitUntil(Promise.resolve());
  }
});

function buildBody(data) {
  if (data.body && data.body !== 'reminder') return data.body;
  if (data.startAt) {
    const d = new Date(data.startAt);
    if (!Number.isNaN(d.getTime())) {
      const time = new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
      return `Sắp diễn ra: ${time}`;
    }
  }
  return 'Bạn có một lời nhắc lịch.';
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Nhắc lịch', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Nhắc lịch';
  const options = {
    body: buildBody(data),
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || '/calendar' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/calendar';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
