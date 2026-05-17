const CACHE_PREFIX = 'isa-rich-cache-';
const CACHE_VERSION = 'v34-simple-buy-reco';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const OFFLINE_URLS = [
  './',
  './index.html',
  './test.html',
  './config.js?v=20260513b',
  './assets/styles.css?v=20260514c',
  './assets/test-styles.css?v=20260513c',
  './assets/skins/test-hero-skin.svg',
  './assets/skins/test-panel-skin.svg',
  './assets/skins/test-holding-skin.svg',
  './assets/app.js?v=20260517h',
  './manifest.webmanifest',
  './icons/app-icon.svg',
  './icons/ui/card-base.svg',
  './icons/ui/card-dividend.svg',
  './icons/ui/card-special.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(OFFLINE_URLS.map((url) => new Request(url, { cache: 'reload' })))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    );

    if ('navigationPreload' in self.registration) {
      await self.registration.navigationPreload.enable();
    }

    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preloadResponse = await event.preloadResponse;
        if (preloadResponse) return preloadResponse;

        const networkResponse = await fetch(event.request);
        const cache = await caches.open(CACHE_NAME);
        const fallbackUrl = url.pathname.endsWith('/test.html') ? './test.html' : './index.html';
        cache.put(fallbackUrl, networkResponse.clone());
        return networkResponse;
      } catch (error) {
        const fallbackUrl = url.pathname.endsWith('/test.html') ? './test.html' : './index.html';
        const cachedPage = await caches.match(fallbackUrl);
        return cachedPage || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;

    try {
      const response = await fetch(event.request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, response.clone());
      }
      return response;
    } catch (error) {
      return caches.match('./index.html');
    }
  })());
});
