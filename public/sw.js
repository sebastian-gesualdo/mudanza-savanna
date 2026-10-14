const CACHE = 'gesualdo-shell-v2';
const STATIC = ['/offline.html', '/icon.svg', '/casa.png', '/manifest.webmanifest'];
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE); await cache.addAll(STATIC);
  const shell = await fetch('/', { cache: 'no-store' });
  if (!shell.ok) throw new Error('Shell unavailable');
  const html = await shell.clone().text(); await cache.put('/app-shell', shell);
  const assets = [...html.matchAll(/(?:src|href)="([^"\s]+)"/g)].map(m => m[1]).filter(path => path.startsWith('/_next/static/'));
  await cache.addAll([...new Set(assets)]);
})()));
// No skipWaiting or forced reload: a new worker activates after the open app closes.
self.addEventListener('activate', event => event.waitUntil((async () => {
  await Promise.all((await caches.keys()).filter(k => k.startsWith('gesualdo-shell-') && k !== CACHE).map(k => caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;
  if (event.request.mode === 'navigate') {
    if (url.pathname !== '/') return;
    // Root is a public shell: no server-rendered account or inventory data.
    event.respondWith(caches.open(CACHE).then(async cache => {
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put('/app-shell', response.clone());
        return response;
      } catch { return (await cache.match('/app-shell')) || (await cache.match('/offline.html')); }
    }));
    return;
  }
  if (STATIC.includes(url.pathname) || url.pathname.startsWith('/_next/static/')) {
    event.respondWith(caches.open(CACHE).then(async cache => {
      const hit = await cache.match(event.request);
      if (hit) return hit;
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    }));
  }
});
