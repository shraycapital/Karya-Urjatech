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
const CACHE_VERSION = 'v22-stale-while-revalidate';
const CACHE_NAME = `app-shell-${CACHE_VERSION}`;
const STATIC_ASSETS_RE = /\.(?:js|css|ico|png|jpg|jpeg|svg|webp|woff2?)$/i;
const CORE_ROUTES = ['/', '/index.html', '/manifest.webmanifest', '/favicon.ico', '/icons/icon-192x192.png', '/icons/icon-512x512.png', '/screenshots/mobile.png', '/screenshots/desktop.png'];
let hasSentUpdateNotice = false;

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
      // Delete all old caches to force complete refresh
      return Promise.all(
        keys.map((k) => {
          console.log('Deleting old cache:', k);
          return caches.delete(k);
        })
      );
    }).then(() => {
      console.log('All caches cleared, claiming clients');
      return clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET
  if (req.method !== 'GET') return;

  // Stale-while-revalidate for navigations (instant load + background update)
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then((cachedResponse) => {
        // Immediately return cached version (if available)
        const fetchPromise = fetch('/index.html')
          .then((freshResponse) => {
            // Update cache in background
            if (freshResponse && freshResponse.ok) {
              const responseToCache = freshResponse.clone();

              return Promise.all([
                cachedResponse ? cachedResponse.text() : Promise.resolve(''),
                freshResponse.text()
              ]).then(([cachedText, freshText]) => {
                const getContentHash = (text) => {
                  const scriptMatches = text.match(/src="\/assets\/[^"]+\.js"/g) || [];
                  const cssMatches = text.match(/href="\/assets\/[^"]+\.css"/g) || [];
                  return [...scriptMatches, ...cssMatches].sort().join('|');
                };

                const cachedHash = getContentHash(cachedText);
                const freshHash = getContentHash(freshText);
                const hasSignificantChange = cachedHash !== freshHash;

                return caches.open(CACHE_NAME).then((cache) => {
                  return cache.put('/index.html', responseToCache).then(() => {
                    if (hasSignificantChange && cachedResponse && !hasSentUpdateNotice) {
                      hasSentUpdateNotice = true;
                      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
                        clientList.forEach((client) => {
                          client.postMessage({
                            type: 'FRESH_CONTENT_AVAILABLE',
                            message: 'A new version is available. Refresh to update.',
                            significant: true
                          });
                        });
                      });
                    }
                  });
                });
              }).catch(() => {
                return caches.open(CACHE_NAME).then((cache) => {
                  return cache.put('/index.html', responseToCache);
                });
              });
            }
            return freshResponse;
          })
          .catch(() => {
            return cachedResponse;
          });

        // Return cached immediately, or wait for network if no cache
        return cachedResponse || fetchPromise;
      })
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