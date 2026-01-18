/**
 * Minimal Service Worker for PWA installability.
 * This service worker enables the app to be installed as a PWA.
 * It does not provide offline caching - just the minimum for installation.
 */

const SW_VERSION = '1.0.0';

self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker v' + SW_VERSION);
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('[SW] Service worker activated');
    event.waitUntil(clients.claim());
});

// Fetch handler is required for PWA installability
self.addEventListener('fetch', (event) => {
    // Pass through all requests to the network
    // No caching - this is just for installability
});
