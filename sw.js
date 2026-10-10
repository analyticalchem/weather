// Service worker: keeps a copy of the app's own files so Weather opens without internet.
// Online, every file comes fresh from the website first (so a new release shows up the next time
// the app opens). Offline, or when the network is very slow, the saved copy is used instead.
// Forecasts and warnings aren't handled here: js/forecast.js and js/alerts.js keep the last ones
// on the device.
importScripts('js/version.js');

const CACHE = 'weather-' + self.Weather.VERSION;
const NETWORK_WAIT_MS = 4000; // after this, use the saved copy and let the network finish in the background

const APP_FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'fonts/atkinson-hyperlegible-next-latin.woff2',
  'fonts/atkinson-hyperlegible-next-latin-ext.woff2',
  'js/version.js',
  'js/settings.js',
  'js/words.js',
  'js/places.js',
  'js/forecast.js',
  'js/alerts.js',
  'js/speech.js',
  'js/charts.js',
  'js/hourly.js',
  'js/app.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_FILES.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

// A new version takes over straight away and removes older copies. The page that's already open
// keeps running the code it loaded; the new files are used the next time the app opens.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('weather-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Every page address (with or without ?something) is the one app page.
function cacheKey(request) {
  const url = new URL(request.url);
  if (request.mode === 'navigate') return new URL('index.html', self.registration.scope).href;
  return url.origin + url.pathname;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const key = cacheKey(request);
  const network = fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(response => {
    if (response.ok) cache.put(key, response.clone());
    return response;
  });
  network.catch(() => {}); // offline: handled below by using the saved copy
  const slow = new Promise((resolve, reject) => setTimeout(() => reject(new Error('slow')), NETWORK_WAIT_MS));
  try {
    return await Promise.race([network, slow]);
  } catch (e) {
    const saved = await cache.match(key);
    return saved || network; // nothing saved yet: keep waiting for the network
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  // Only the app's own files. Weather and place searches go straight to Open-Meteo, and the
  // update check in Settings (?check=) always asks the website itself.
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.searchParams.has('check')) return;
  event.respondWith(networkFirst(request));
});
