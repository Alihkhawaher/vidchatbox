// YouTube proxy service worker with transcriber caching
const CACHE_NAME = 'vidchatbox-v2';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/main.js',
    '/transcriber.js',
    '/events.js',
    '/utils.js',
    '/translations.js',
    '/styles.css',
    '/js/router.js',
    '/menu.html'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(names =>
            Promise.all(
                names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
            )
        )
    );
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Only intercept YouTube requests
    if (url.hostname === 'www.youtube.com' || url.hostname === 'youtube.com') {
        event.respondWith(
            fetch(event.request.url, {
                method: event.request.method,
                mode: 'no-cors',
                credentials: 'omit'
            })
        );
    }
});