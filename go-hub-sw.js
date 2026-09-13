"use strict";

const CACHE_PREFIX = "go-hub-app-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const APP_SHELL = [
  "./go-hub.html",
  "./go-hub-shell.css",
  "./go-hub-shell.js",
  "./go-hub-runtime.js",
  "./go-hub.webmanifest"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .map(name => caches.delete(name)),
    );
  })());
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  const shellUrls = new Set(APP_SHELL.map(path => new URL(path, self.location.href).href));
  const isHubNavigation = event.request.mode === "navigate" && requestUrl.pathname.endsWith("/go-hub.html");
  if (!isHubNavigation && !shellUrls.has(requestUrl.href)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(isHubNavigation ? "./go-hub.html" : event.request);
    if (cached) return cached;
    return fetch(event.request);
  })());
});
