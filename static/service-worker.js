/**
 * Minimal Service Worker for PWA installability.
 * This service worker enables the app to be installed as a PWA.
 * It does not provide offline caching - just the minimum for installation.
 */

const SW_VERSION = '1.1.0';

self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker v' + SW_VERSION);
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('[SW] Service worker activated');
    event.waitUntil(clients.claim());
});

// NO fetch handler. A fetch handler is NOT required for PWA installability
// anymore (Chrome dropped that requirement); an EMPTY one that never calls
// respondWith() is a "no-op fetch handler" the browser flags as adding
// per-navigation overhead. This SW does no caching, so it registers none.
