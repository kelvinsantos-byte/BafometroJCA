const CACHE_NAME = "bafometro-jca-v14";

const APP_SHELL = [
  "index.html",
  "portal-adm.html",
  "portal-operacao.html",
  "css/style.css",
  "js/config.js",
  "js/auth.js",
  "js/sheets.js",
  "js/firebase-init.js",
  "js/adm.js",
  "js/operacao.js",
  "js/pwa.js",
  "js/theme.js",
  "data/motoristas.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Estratégia: network-first para APIs (Google/Firebase), cache-first para o app shell
self.addEventListener("fetch", (event) => {
  const url = event.request.url;
  const isExternalApi = url.includes("googleapis.com") || url.includes("firestore") || url.includes("gstatic.com");

  if (isExternalApi) return; // deixa passar direto para a rede, sem cache

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => cached);
    })
  );
});
