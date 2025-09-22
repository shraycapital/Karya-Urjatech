/* global importScripts, firebase */
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBOIBP01j6m1K7DrwsQCo9bWN1yG-e48RM",
  authDomain: "kartavya-58d2c.firebaseapp.com",
  projectId: "kartavya-58d2c",
  storageBucket: "kartavya-58d2c.firebasestorage.app",
  messagingSenderId: "899861294582",
  appId: "1:899861294582:web:80adaebe5a29daacac2bd7",
  measurementId: "G-TW66R38EE6"
});

const messaging = firebase.messaging();

// ------- Push notifications (foreground handled in app) -------
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification || {};
  const link = payload?.data?.link || '/';
  self.registration.showNotification(title || 'Notification', {
    body: body || '',
    icon: icon || '/favicon.ico',
    data: { link }
  });
});

// Ensure clicks focus or open the app
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const urlFromData = event.notification?.data?.link || '/';
  const urlToOpen = new URL(urlFromData, self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// ------- Safe offline caching for app shell & static assets -------
const CACHE_VERSION = 'v18-force-refresh';
const CACHE_NAME = `app-shell-${CACHE_VERSION}`;
const STATIC_ASSETS_RE = /\.(?:js|css|ico|png|jpg|jpeg|svg|webp|woff2?)$/i;
const CORE_ROUTES = ['/', '/index.html', '/manifest.webmanifest', '/favicon.ico', '/icons/icon-192x192.png', '/icons/icon-512x512.png', '/screenshots/mobile.png', '/screenshots/desktop.png'];

self.addEventListener('install', (event) => {
  // Force skip waiting to immediately activate new service worker
  self.skipWaiting();
  
  // Clear all old caches first
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      // Also clear any existing cache with the same name to ensure fresh start
      return caches.delete(CACHE_NAME);
    }).then(() => {
      // Now cache the new assets
      return caches.open(CACHE_NAME);
    }).then(cache => {
      return cache.addAll(CORE_ROUTES);
    })
  );
});

self.addEventListener('activate', (event) => {
  // Force immediate control of all clients
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => {
          return caches.delete(k);
        })
      );
    }).then(() => {
      return clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET
  if (req.method !== 'GET') return;

  // Network-first for navigations (SPA)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return resp;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Cache-first for versioned/static assets
  const url = new URL(req.url);
  if (STATIC_ASSETS_RE.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(req).then((resp) => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return resp;
        }).catch((error) => {
          console.error('Fetch failed for:', req.url, error);
          return cached;
        });
      })
    );
  }
  // All other requests pass-through (Firestore, APIs)
});