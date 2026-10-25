// RadaStudentów24 service worker — push notifications + offline fallback page.
// Deliberately caches NOTHING else: session/vote data must always be live.
const OFFLINE_CACHE = 'rs24-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })()
  );
});

// Navigations: network first; only when the network is down show the offline page.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    (async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) return preload;
        return await fetch(event.request);
      } catch {
        const cache = await caches.open(OFFLINE_CACHE);
        return (await cache.match(OFFLINE_URL)) || Response.error();
      }
    })()
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'RadaStudentów24', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'RadaStudentów24', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: data.tag,
      renotify: Boolean(data.tag),
      requireInteraction: Boolean(data.tag && data.tag.startsWith('vote-')),
      vibrate: [120, 60, 120, 60, 240],
      data: { url: data.url || '/' },
    })
  );
});

// Tap → focus an open app window (navigating it) or open a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ('navigate' in client) return client.navigate(target);
          return;
        }
      }
      return self.clients.openWindow(target);
    })()
  );
});
