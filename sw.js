const CACHE_NAME = 'wastewatch-v1.1';
const URLS_TO_CACHE = [
    './',
    'index.html',
    'styles.css',
    'app.js',
    'manifest.json',
    'favicon.svg',
    './icons/icon-72x72.png',
    './icons/icon-144x144.png',
    './icons/icon-152x152.png',
    './icons/icon-192x192.png',
    './icons/icon-384x384.png',
    './icons/icon-512x512.png',
    './images/screenshot-desktop.png',
    './images/screenshot-mobile.png',
    'libs/chart.min.js',
    'https://fonts.googleapis.com/css2?family=VT323&display=swap'
];

// Install the service worker and cache the app shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Opened cache');
                return cache.addAll(URLS_TO_CACHE);
            })
    );
});

// Serve content using a Stale-While-Revalidate strategy
self.addEventListener('fetch', (event) => {
    // For requests to other origins (like Google Fonts), use a network-first strategy.
    if (!event.request.url.startsWith(self.location.origin)) {
        event.respondWith(
            caches.open(CACHE_NAME).then(async (cache) => {
                try {
                    const response = await fetch(event.request);
                    await cache.put(event.request, response.clone());
                    return response;
                } catch (error) {
                    // If network fails, try to serve from cache.
                    return await cache.match(event.request);
                }
            })
        );
        return;
    }

    // For same-origin requests, use Stale-While-Revalidate.
    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const cachedResponse = await cache.match(event.request);
            const fetchedResponse = fetch(event.request).then((networkResponse) => {
                cache.put(event.request, networkResponse.clone());
                return networkResponse;
            });
            return cachedResponse || fetchedResponse;
        })
    );
});

// Clean up old caches
self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (!cacheWhitelist.includes(cacheName)) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});