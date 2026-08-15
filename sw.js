const CACHE_NAME = 'atlas-shell-v189';
const OCR_CACHE_NAME = 'atlas-ocr-runtime-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/variables.css?v=3',
  './css/global.css?v=3',
  './css/layout.css?v=43',
  './css/components.css?v=158',
  './data/defaultSchedule.json',
  './assets/icons/atlas-192.png',
  './assets/icons/atlas-512.png',
  './assets/icons/atlas-brand.png',
  './assets/icons/atlas-maskable.png',
  './js/app.js?v=157',
  './js/atlas.js?v=156',
  './js/router.js?v=152',
  './js/store.js',
  './js/cloud/config.js',
  './js/cloud/client.js',
  './js/cloud/auth.js?v=2',
  './js/sync/metadata.js',
  './js/sync/apply.js',
  './js/sync/inspect.js',
  './js/sync/merge.js',
  './js/sync/remote.js',
  './js/sync/snapshot.js',
  './js/sync/sync.js?v=5',
  './js/sync/backup.js',
  './js/components/classItem.js?v=3',
  './js/components/atmosphere.js?v=6',
  './js/components/developerTools.js',
  './js/components/installButton.js',
  './js/components/navbar.js?v=3',
  './js/components/onboarding.js?v=38',
  './js/components/helpPanel.js?v=4',
  './js/components/settingsPanel.js?v=10',
  './js/components/profilePanel.js?v=10',
  './js/components/timePicker.js?v=2',
  './js/services/personalization.js?v=2',
  './js/components/selectEnhancer.js?v=43',
  './js/components/pathSection.js',
  './js/components/taskList.js?v=3',
  './js/components/datePicker.js?v=3',
  './js/components/themeToggle.js?v=2',
  './js/components/welcomeScreen.js?v=47',
  './js/services/ocr.js?v=42',
  './js/services/ocrCorrections.js',
  './js/services/autosave.js',
  './js/services/aiSchedule.js?v=5',
  './js/services/notes.js?v=37',
  './js/services/pdfText.js?v=38',
  './js/services/exams.js',
  './js/services/notifications.js',
  './js/services/schedule.js',
  './js/services/scheduleArchives.js',
  './js/services/scheduleParser.js?v=47',
  './js/services/tasks.js',
  './js/utils/html.js',
  './js/utils/animations.js?v=9',
  './js/utils/time.js',
  './js/views/home.js?v=62',
  './js/views/importSchedule.js?v=69',
  './js/views/schedule.js?v=79',
  './js/views/classDetail.js?v=57'
];

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
