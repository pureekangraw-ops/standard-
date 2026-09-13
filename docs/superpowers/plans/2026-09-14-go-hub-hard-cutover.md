# GO Hub Hard Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `standard-` publish GO Hub as the only supported runtime surface.

**Architecture:** Remove NormalPocket compatibility from active root/publication, activate the dedicated GO Hub service worker at `/`, and leave legacy source only as unpublished reference.

**Tech Stack:** HTML/CSS/JavaScript, Service Worker API, Web App Manifest, Node.js 22 `node:test`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-14-go-hub-hard-cutover-design.md`

## Global Constraints
- Work on `go-hub-foundation`; no merge/deploy without separate owner approval.
- GO Hub owns `/`, `go-hub.webmanifest`, `go-hub-sw.js`, cache namespace `go-hub-app-`, and offline root startup.
- NormalPocket routing, IndexedDB detection, offline compatibility, old caches, and installed identity are no longer release requirements.
- Do not mass-delete legacy source in this phase.
- TDD: RED -> minimal GREEN -> full gate -> fresh CI.

---

### Task 1: Hard-cutover RED contract

**Files:** Create `tests/go-hub-hard-cutover.test.cjs`.

**Produces:** assertions that `index.html` uses `go-hub-sw-bootstrap.js` and no `normalpocket-root-compat.js`; `go-hub-sw.js` owns root/offline and contains no legacy cache/runtime names; `RELEASE_MANIFEST.json` and `.assetsignore` exclude NormalPocket assets.

- [ ] Write test with `node:test`/`assert` reading `index.html`, `go-hub-sw.js`, `RELEASE_MANIFEST.json`, `.assetsignore`.
- [ ] Assert `go-hub-sw-bootstrap.js` exists and registers `./go-hub-sw.js` at scope `/`.
- [ ] Assert release has `product: "GO Hub"`, no `compatibility`, service worker file `go-hub-sw.js`, prefix `go-hub-app-`.
- [ ] Assert `normalpocket.html`, `normalpocket-root-compat.js`, `manifest.webmanifest`, `sw.js`, `app.js`, `metropolis-r5.js` are absent from production files/allowlist.
- [ ] Commit `test: define GO Hub hard cutover contract`.
- [ ] Wait for `STANDARD Safety Gate`; expected RED from current compatibility root/publication.

### Task 2: Exclusive root + service-worker ownership

**Files:** Create `go-hub-sw-bootstrap.js`; modify `index.html`, `go-hub.html`, `go-hub-sw.js`, `package.json`.

**Interfaces:** `go-hub-sw-bootstrap.js` registers `./go-hub-sw.js`; the SW caches root shell and handles `/`, `/index.html`, `/go-hub.html` navigation.

- [ ] Create bootstrap using HTTPS/localhost support check and `navigator.serviceWorker.register("./go-hub-sw.js", { scope: "/", updateViaCache: "none" })`.
- [ ] Remove `normalpocket-root-compat.js` from root; load `go-hub-sw-bootstrap.js` before `go-hub-shell.js` in both Hub HTML files.
- [ ] Set SW constants `CACHE_PREFIX = "go-hub-app-"`, `CACHE_NAME = "go-hub-app-v2-hard-cutover"`.
- [ ] Precache `./`, `./index.html`, `./go-hub.html`, `./go-hub.webmanifest`, `./go-hub-shell.css`, `./go-hub-shell.js`, `./go-hub-runtime.js`, `./go-hub-sw-bootstrap.js`.
- [ ] Install calls `self.skipWaiting()`; activate deletes obsolete caches only under `go-hub-app-` and calls `self.clients.claim()`.
- [ ] Fetch maps Hub navigations to cached `./index.html`; static same-origin requests are cache-first then network.
- [ ] Add `node --check go-hub-sw-bootstrap.js` and `node --check go-hub-sw.js` to syntax gate.
- [ ] Run focused test; publication part may remain RED until Task 3.
- [ ] Commit `feat: give GO Hub root service-worker ownership`.

### Task 3: GO-Hub-only publication truth

**Files:** Modify `RELEASE_MANIFEST.json`, `.assetsignore`, and stale compatibility-publication tests.

**Target release:** `release: "go-hub-hard-cutover-1"`, `product: "GO Hub"`, `rootEntry: "index.html"`, no `compatibility`, service worker `{ file: "go-hub-sw.js", mode: "go-hub-exclusive", cachePrefix: "go-hub-app-", cacheGeneration: "v2-hard-cutover", autoActivate: true }`.

**Production files only:** `index.html`, `go-hub.html`, `go-hub.webmanifest`, `go-hub-shell.css`, `go-hub-shell.js`, `go-hub-runtime.js`, `go-hub-sw-bootstrap.js`, `go-hub-sw.js`.

- [ ] Replace `.assetsignore` allowlist with exactly those eight files (plus standard ignore headers).
- [ ] Rewrite compatibility-publication assertions in `go-hub-active-publication`, `go-hub-publication-seam`, `go-hub-pwa-seam`, `go-hub-root-cutover`, `finance-cache-activation`, `product-publication`, `simple-shop-flow`, `publication-contract` so legacy source may exist but is not required in production/cache.
- [ ] Do not weaken retained source-business behavior tests unrelated to publication.
- [ ] Run `npm test`; classify any remaining failure as real source regression vs stale compatibility expectation before changing it.
- [ ] Commit `refactor: retire NormalPocket from active publication`.

### Task 4: Full verification and stop gate

- [ ] Run `npm run deploy:gate`; require tests + syntax + UTF-8 + no-RIDE all PASS.
- [ ] Verify release production files and `.assetsignore` are identical in active asset ownership and contain no NormalPocket/Metropolis/legacy `sw.js` runtime.
- [ ] Wait for fresh `STANDARD Safety Gate` at final head; inspect job and logs, not just status badge.
- [ ] Stop before merge/deploy.

After separately approved deploy, real-device test is: online `/` -> GO Hub; reload online so dedicated SW controls; disable network and reload `/` -> GO Hub still opens; re-enable network -> GO Hub recovers with no NormalPocket redirect.
