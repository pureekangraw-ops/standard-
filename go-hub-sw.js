"use strict";

const CACHE_PREFIX = "go-hub-app-";
const CACHE_NAME = `${CACHE_PREFIX}v6-centre-live-checkpoint`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./go-hub.html",
  "./go-hub.webmanifest",
  "./go-hub-shell.css",
  "./go-hub-shell.js",
  "./go-hub-runtime.js",
  "./go-hub-centre.js",
  "./go-hub-city-route.js",
  "./go-hub-optician.js",
  "./go-hub-factory-return.js",
  "./go-hub-code-module.js",
  "./go-hub-code-task.js",
  "./go-hub-evidence-ledger.js",
  "./go-hub-piece-qc.js",
  "./go-hub-ready-gate.js",
  "./go-hub-assembly-bench.js",
  "./go-hub-assembly-qc.js",
  "./go-hub-artifact.js",
  "./go-hub-product-qc.js",
  "./go-hub-verification-scanner.js",
  "./go-hub-housekeeper.js",
  "./go-hub-learning-recorder.js",
  "./go-hub-workbench-model.js",
  "./go-hub-github-workspace.js",
  "./go-hub-persistence.js",
  "./go-hub-sw-bootstrap.js",
];

function isHubNavigation(request) {
  if (request.mode !== "navigate") return false;
  const pathname = new URL(request.url).pathname;
  return pathname === "/"
    || pathname.endsWith("/index.html")
    || pathname.endsWith("/go-hub.html");
}

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .map(name => caches.delete(name)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (isHubNavigation(event.request)) {
    event.respondWith((async () => {
      try {
        return await fetch(event.request);
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match("./index.html")) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    return fetch(event.request);
  })());
});
