/* AnonVault service worker — makes the app installable and lets it open
   without a connection. Data is already saved on the device (localStorage)
   and syncs with Supabase when online; this only caches the app itself.

   - Page loads: network first, falling back to the cached page offline.
   - /assets/* (file names change on every build): cache first.
   - Anything on another origin (Supabase, fonts) is left alone.
   - Clicking a reminder notification opens the app, or the meeting link. */

const CACHE = 'anonvault-v1';
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('/', copy)); return res; })
        .catch(() => caches.match('/')),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })),
    );
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const link = event.notification.data?.link;
  event.waitUntil((async () => {
    if (event.action === 'join' && link) return self.clients.openWindow(link);
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = wins.find(w => new URL(w.url).origin === self.location.origin);
    if (app) return app.focus();
    return self.clients.openWindow('/');
  })());
});
