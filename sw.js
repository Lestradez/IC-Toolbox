// Service worker: precarga todos los recursos y sirve cache-first para que la app
// funcione sin conexión.
//
// No edites la versión ni la lista: scripts/build.mjs las rellena al publicar
// (la versión lleva un hash del contenido, así que cambia con cualquier archivo).
const CACHE_VERSION = '__CACHE_VERSION__';
const PRECACHE = [/* __PRECACHE__ */];

self.addEventListener('install', (event) => {
  // cache: 'reload' salta la caché HTTP del navegador. Sin esto, en los minutos tras un
  // deploy el SW nuevo podría guardar copias viejas de los archivos bajo la versión nueva.
  event.waitUntil(
    caches.open(CACHE_VERSION).then((c) => c.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
  );
  // Sin skipWaiting aquí: la versión nueva espera a que el usuario pulse «Actualizar»
  // (o a que cierre la app). Así una página vieja nunca mezcla archivos de dos versiones.
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE_VERSION).then((cache) => cache.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => (req.mode === 'navigate' ? cache.match('./index.html') : Response.error()));
    })),
  );
});
