const CACHE_NAME = 'wastewatch-v1';
const URLS_TO_CACHE = [
    './',
    'index.html',
    'styles.css',
    'app.js',
    'manifest.json',
    'favicon.svg',
    './icons/icon-72x72.png',
    './icons/icon-120x120.png',
    './icons/icon-144x144.png',
    './icons/icon-152x152.png',
    './icons/icon-167x167.png',
    './icons/icon-180x180.png',
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

// Serve cached content when offline
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Cache hit - return response
                if (response) {
                    return response;
                }
                return fetch(event.request);
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
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});