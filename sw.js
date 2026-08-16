"use strict";

const APP_CACHE_PREFIX = "ygph-standard-app-";
const LEGACY_CACHE_PREFIXES = Object.freeze([
  "ygph-standard-0.1.0-preview."
]);
const RELEASE_ID = "v1.3.1-20260812-r6-mobile-polish";
const CURRENT_CACHE = `${APP_CACHE_PREFIX}${RELEASE_ID}`;
const META_CACHE = "ygph-standard-meta";
const META_PATH = "__ygph_service_worker_lifecycle__";
const APP_SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "normalpocket-current.css",
  "styles.css",
  "flow-era.css",
  "metropolis-v4.css",
  "metropolis-r5.css",
  "metropolis-r5-1.css",
  "metropolis-r5-2.css",
  "metropolis-r5-3.css",
  "metropolis-r5-4.css",
  "normalpocket-products.css",
  "normalpocket-simple-flow.css",
  "sw-bootstrap.js",
  "normalpocket-runtime.js",
  "normalpocket-state-port.js",
  "normalpocket-flow-calendar-bridge.js",
  "normalpocket-live-source-bridge.js",
  "normalpocket-bootstrap.js",
  "normalpocket-catalog-core.js",
  "normalpocket-products.js",
  "normalpocket-reconcile.js",
  "normalpocket-simple-flow.js",
  "highway-gate.js",
  "app.js",
  "flow-era.js",
  "metropolis-r5.js",
  "metropolis-r5-2.js",
  "src/current-bootstrap.mjs",
  "src/architecture/authority.mjs",
  "src/architecture/release-authority.mjs",
  "src/workflows/command-authority.mjs",
  "src/workflows/workflow-coordinator.mjs",
  "src/projection/live-records.mjs",
  "src/projection/live-projection.mjs",
  "src/shell/shell-boundary.mjs",
  "src/store/store-boundary.mjs",
  "src/finance/installment-schedule.mjs",
  "src/finance/installment-operations.mjs",
  "src/finance/finance-boundary.mjs",
  "src/calendar/calendar-boundary.mjs",
  "app-icon.svg",
  "icon-192.png",
  "icon-512.png"
];

function lifecycleBase(value = {}) {
  return {
    version: 1,
    current: value.current || null,
    serving: value.serving || value.current || null,
    previous: value.previous || null,
    rolledBack: Boolean(value.rolledBack),
    updatedAt: value.updatedAt || null
  };
}

function planActivation(existing, installedCache, at = new Date().toISOString()) {
  const before = lifecycleBase(existing);
  if (before.current === installedCache) {
    return { ...before, serving: before.serving || installedCache, updatedAt: at };
  }
  const previous = before.serving && before.serving !== installedCache
    ? before.serving
    : before.current && before.current !== installedCache
      ? before.current
      : before.previous && before.previous !== installedCache
        ? before.previous
        : null;
  return {
    version: 1,
    current: installedCache,
    serving: installedCache,
    previous,
    rolledBack: false,
    updatedAt: at
  };
}

function planRollback(existing, at = new Date().toISOString()) {
  const before = lifecycleBase(existing);
  if (!before.previous || before.previous === before.current) throw new Error("ไม่มีรุ่นก่อนหน้าให้ย้อนกลับ");
  return { ...before, serving: before.previous, rolledBack: true, updatedAt: at };
}

function planUseCurrent(existing, at = new Date().toISOString()) {
  const before = lifecycleBase(existing);
  if (!before.current) throw new Error("ไม่พบรุ่นล่าสุด");
  return { ...before, serving: before.current, rolledBack: false, updatedAt: at };
}

function obsoleteAppCaches(cacheNames, lifecycle) {
  const keep = new Set([lifecycle?.current, lifecycle?.serving, lifecycle?.previous].filter(Boolean));
  return cacheNames.filter(name => name.startsWith(APP_CACHE_PREFIX) && !keep.has(name));
}

function legacyAppCaches(cacheNames = []) {
  return cacheNames.filter(name => LEGACY_CACHE_PREFIXES.some(prefix => name.startsWith(prefix)));
}

function shouldAutoActivateLegacyBridge(cacheNames, lifecycle) {
  const current = lifecycleBase(lifecycle);
  const hasSafeGeneration = Boolean(current.current || current.serving || current.previous);
  return !hasSafeGeneration && legacyAppCaches(cacheNames).length > 0;
}

function assertShellReadback(responses) {
  if (!Array.isArray(responses) || responses.length !== APP_SHELL.length || responses.some(response => !response || !response.ok)) {
    throw new Error("ไฟล์ออฟไลน์ไม่ครบ");
  }
  return true;
}

function offlineLookupKeys(request) {
  return request?.mode === "navigate" ? ["index.html", "./"] : [request];
}

if (typeof self !== "undefined" && typeof self.addEventListener === "function") {
  const scopedUrl = path => new URL(path, self.registration.scope).href;
  const lifecycleRequest = () => new Request(scopedUrl(META_PATH));

  async function readLifecycle() {
    const cache = await caches.open(META_CACHE);
    const response = await cache.match(lifecycleRequest());
    if (!response) return lifecycleBase();
    try { return lifecycleBase(await response.json()); }
    catch { return lifecycleBase(); }
  }

  async function writeLifecycle(value) {
    const next = lifecycleBase(value);
    const cache = await caches.open(META_CACHE);
    await cache.put(lifecycleRequest(), new Response(JSON.stringify(next), {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    }));
    const saved = await readLifecycle();
    if (JSON.stringify(saved) !== JSON.stringify(next)) throw new Error("อ่านสถานะ Service Worker กลับแล้วไม่ตรง");
    return saved;
  }

  async function precacheRelease() {
    const cacheNames = await caches.keys();
    const existed = cacheNames.includes(CURRENT_CACHE);
    const cache = await caches.open(CURRENT_CACHE);
    try {
      const requests = APP_SHELL.map(path => new Request(scopedUrl(path), { cache: "reload" }));
      await cache.addAll(requests);
      const readback = await Promise.all(requests.map(request => cache.match(request)));
      assertShellReadback(readback);
    } catch (error) {
      if (!existed) await caches.delete(CURRENT_CACHE);
      throw error;
    }
  }

  async function updateStatus() {
    const lifecycle = await readLifecycle();
    const cacheNames = await caches.keys();
    return {
      type: "UPDATE_STATUS",
      releaseId: RELEASE_ID,
      lifecycle,
      canRollback: Boolean(lifecycle.previous && cacheNames.includes(lifecycle.previous)),
      usingPrevious: Boolean(lifecycle.current && lifecycle.serving !== lifecycle.current)
    };
  }

  self.addEventListener("install", event => { event.waitUntil(precacheRelease()); });
  self.addEventListener("activate", event => {
    event.waitUntil((async () => {
      const before = await readLifecycle();
      const cacheNames = await caches.keys();
      const next = planActivation(before, CURRENT_CACHE);
      await writeLifecycle(next);
      if (shouldAutoActivateLegacyBridge(cacheNames, before)) await self.clients.claim();
      const refreshedNames = await caches.keys();
      await Promise.all([
        ...obsoleteAppCaches(refreshedNames, next).map(name => caches.delete(name)),
        ...legacyAppCaches(refreshedNames).map(name => caches.delete(name))
      ]);
    })());
  });

  self.addEventListener("fetch", event => {
    if (event.request.method !== "GET") return;
    event.respondWith((async () => {
      const lifecycle = await readLifecycle();
      const servingCache = lifecycle.serving || lifecycle.current || CURRENT_CACHE;
      const cache = await caches.open(servingCache);
      for (const key of offlineLookupKeys(event.request)) {
        const cached = await cache.match(key);
        if (cached) return cached;
      }
      return fetch(event.request);
    })());
  });

  self.addEventListener("message", event => {
    event.waitUntil((async () => {
      const type = event.data?.type;
      let result;
      if (type === "UPDATE_STATUS") result = await updateStatus();
      else if (type === "SKIP_WAITING") {
        await self.skipWaiting();
        result = { type: "SKIP_WAITING_OK", releaseId: RELEASE_ID };
      } else if (type === "ROLLBACK") {
        result = { type: "ROLLBACK_OK", lifecycle: await writeLifecycle(planRollback(await readLifecycle())) };
      } else if (type === "USE_CURRENT") {
        result = { type: "USE_CURRENT_OK", lifecycle: await writeLifecycle(planUseCurrent(await readLifecycle())) };
      } else return;
      if (event.source?.postMessage) event.source.postMessage(result);
    })());
  });
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    APP_CACHE_PREFIX,
    LEGACY_CACHE_PREFIXES,
    RELEASE_ID,
    CURRENT_CACHE,
    META_CACHE,
    META_PATH,
    APP_SHELL,
    lifecycleBase,
    planActivation,
    planRollback,
    planUseCurrent,
    obsoleteAppCaches,
    legacyAppCaches,
    shouldAutoActivateLegacyBridge,
    assertShellReadback,
    offlineLookupKeys
  };
}
