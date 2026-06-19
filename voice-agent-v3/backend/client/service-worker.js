const CACHE = 'casa-voice-v3-dual-2';
const FILES = [
  '/client/index.html',
  '/client/app.js',
  '/client/audio-device.html',
  '/client/audio-device.js',
  '/client/tap.html',
  '/client/manifest.json',
  '/client/icon.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept WebSocket upgrade requests
  if (e.request.headers.get('Upgrade') === 'websocket') {
    return;
  }

  // Only serve known static files from cache; pass everything else to network
  if (e.request.method === 'GET' && FILES.includes(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        return cached || fetch(e.request);
      })
    );
  }
  // All other requests (including /ws/voice) go straight to network
});
