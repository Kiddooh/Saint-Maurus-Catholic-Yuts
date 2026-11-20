/* Cache only an anonymous offline notice. Never cache API responses or pages. */
const CACHE = 'maurus-offline-v1';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add('/offline.html')));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('maurus-offline-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.mode !== 'navigate' || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(request).catch(() => caches.open(CACHE).then(cache => cache.match('/offline.html')).then(response => response || Response.error())));
});
