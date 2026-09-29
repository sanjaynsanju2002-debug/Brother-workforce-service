const CACHE = 'bws-public-v2';
const PUBLIC_FILES = [
  '/app.html', '/offline.html', '/install.js',
  '/app-icons/icon-192.png', '/app-icons/icon-512.png', '/app-icons/maskable-512.png'
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PUBLIC_FILES)));
  // New versions wait for existing windows to close; never reload a form in progress.
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('bws-public-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Do not cache API responses, resumes, credentials, POSTs, or third-party assets.
  if (request.method !== 'GET' || url.origin !== self.location.origin ||
      url.pathname === '/api' || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return;
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE);
      const target = ['/app', '/app/', '/app.html'].includes(url.pathname) ? '/app.html' : '/offline.html';
      return (await cache.match(target)) || Response.error();
    }));
    return;
  }
  if (PUBLIC_FILES.includes(url.pathname)) {
    event.respondWith(fetch(request).catch(async () =>
      (await caches.match(url.pathname)) || Response.error()
    ));
  }
});
