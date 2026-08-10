const CACHE_NAME = 'atlas-shell-v94';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/variables.css?v=2',
  './css/global.css?v=2',
  './css/layout.css?v=43',
  './css/components.css?v=91',
  './data/defaultSchedule.json',
  './assets/icons/atlas-192.png',
  './assets/icons/atlas-512.png',
  './assets/icons/atlas-brand.png',
  './assets/icons/atlas-maskable.png',
  './js/app.js?v=78',
  './js/atlas.js?v=77',
  './js/router.js?v=76',
  './js/store.js',
  './js/components/classItem.js',
  './js/components/atmosphere.js?v=4',
  './js/components/developerTools.js',
  './js/components/installButton.js',
  './js/components/navbar.js',
  './js/components/onboarding.js?v=33',
  './js/components/helpPanel.js?v=3',
  './js/components/settingsPanel.js',
  './js/components/selectEnhancer.js?v=43',
  './js/components/pathSection.js',
  './js/components/taskList.js',
  './js/components/themeToggle.js',
  './js/components/welcomeScreen.js?v=45',
  './js/services/ocr.js?v=41',
  './js/services/autosave.js',
  './js/services/aiSchedule.js?v=2',
  './js/services/notes.js?v=37',
  './js/services/pdfText.js?v=38',
  './js/services/exams.js',
  './js/services/notifications.js',
  './js/services/schedule.js',
  './js/services/scheduleArchives.js',
  './js/services/scheduleParser.js?v=46',
  './js/services/tasks.js',
  './js/utils/html.js',
  './js/utils/animations.js',
  './js/utils/time.js',
  './js/views/home.js?v=44',
  './js/views/importSchedule.js?v=60',
  './js/views/schedule.js?v=55',
  './js/views/classDetail.js?v=42'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    const networkResponse = fetch(event.request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', response.clone()));
      return response;
    });
    event.respondWith(
      caches.match('./index.html').then((cached) => cached || networkResponse).catch(() => networkResponse)
    );
    event.waitUntil(networkResponse.catch(() => undefined));
    return;
  }

  event.respondWith(
    fetch(event.request).then((response) => {
        if (response.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        }
        return response;
      }).catch(() => caches.match(event.request))
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
