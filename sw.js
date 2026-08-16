const CACHE_NAME = 'atlas-shell-__BUILD_HASH__';
const OCR_CACHE_NAME = 'atlas-ocr-runtime-v1';
const APP_SHELL = /* __PRECACHE_MANIFEST__ */ [];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => ![CACHE_NAME, OCR_CACHE_NAME].includes(key)).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isOcrRuntime = /(?:cdn\.jsdelivr\.net|tessdata\.projectnaptha\.com)$/.test(url.hostname)
    && /(?:tesseract|traineddata)/i.test(url.pathname);
  if (isOcrRuntime) {
    event.respondWith(caches.open(OCR_CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok || response.type === 'opaque') cache.put(event.request, response.clone()).catch(() => {});
      return response;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    const networkResponse = fetch(event.request).then((response) => {
      if (response.ok) {
        const responseForCache = response.clone();
        caches.open(CACHE_NAME)
          .then((cache) => cache.put('./index.html', responseForCache))
          .catch(() => {});
      }
      return response;
    });
    event.respondWith(networkResponse.catch(() => caches.match('./index.html')));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const responseForCache = response.clone();
        caches.open(CACHE_NAME)
          .then((cache) => cache.put(event.request, responseForCache))
          .catch(() => {});
      }
      return response;
    })).catch(() => Response.error())
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { title: 'Atlas reminder', body: event.data?.text() || '' };
  }

  event.waitUntil(self.registration.showNotification(payload.title || 'Atlas reminder', {
    body: payload.body || '',
    tag: payload.tag || `atlas-${Date.now()}`,
    icon: './assets/icons/atlas-192.png',
    badge: './assets/icons/atlas-192.png',
    data: { url: payload.url || './#/home' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || './#/home', self.location.href).href;

  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
    const client = clients[0];
    if (client) {
      await client.navigate(targetUrl);
      return client.focus();
    }
    return self.clients.openWindow(targetUrl);
  }));
});
