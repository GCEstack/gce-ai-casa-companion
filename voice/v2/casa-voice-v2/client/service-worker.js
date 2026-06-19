self.addEventListener('install', e => {
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(self.clients.claim());
});

// Pass-through: don't cache anything, just fetch fresh
self.addEventListener('fetch', e => {
    e.respondWith(fetch(e.request));
});
