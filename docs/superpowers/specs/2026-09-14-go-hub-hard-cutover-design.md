# GO Hub Hard Cutover / Legacy Retirement Design

**Date:** 2026-09-14
**Status:** Owner direction approved in chat; written spec awaiting owner review
**Branch:** `go-hub-foundation`
**Base:** `main`

## Goal

Make `standard-` publish GO Hub as the only supported runtime surface. NormalPocket is no longer a compatibility requirement: legacy files may remain in repository history or as non-published reference, but the production publication, root routing, PWA identity, service-worker ownership, offline behavior, and release truth belong to GO Hub only.

## Owner decision that changes the migration contract

The previous design protected installed NormalPocket clients, including their legacy IndexedDB, service-worker cache generation, route, and offline path. The owner has now explicitly stated that no one relies on the old NormalPocket client and that breaking it is acceptable.

Therefore the following are no longer release blockers:

- NormalPocket root compatibility routing
- legacy IndexedDB detection (`ygph-standard-secure`)
- NormalPocket offline compatibility
- old NormalPocket service-worker/cache continuity
- preserving the installed NormalPocket PWA identity
- guaranteeing access to legacy Store / Ledger / Calendar data through the old UI

No destructive data migration is introduced. Old data may remain on devices, but GO Hub does not promise to read or preserve it.

## Chosen approach: hard publication cutover, soft repository retirement

Three possible strategies were considered:

1. **Keep compatibility indefinitely** — safest for old clients but leaves legacy ownership in the active architecture. Rejected because there are no active legacy users.
2. **Delete all legacy code immediately** — produces the smallest tree but creates unnecessary deletion risk and makes rollback/debugging harder. Rejected for this phase.
3. **Hard publication cutover, soft repository retirement** — publish only GO Hub, remove all legacy runtime dependencies from active entry points and release metadata, but keep legacy source files temporarily unreferenced and unpublished. **Selected.**

This keeps the active system clean without mixing publication cutover with mass deletion.

## Target runtime ownership

```text
/
└── index.html                 GO Hub root
    ├── go-hub.webmanifest     GO Hub PWA identity
    ├── go-hub-shell.css
    ├── go-hub-shell.js
    ├── go-hub-runtime.js
    └── go-hub-sw-bootstrap.js
         └── go-hub-sw.js      GO Hub service worker / offline owner
```

The active root must not load or route through:

- `normalpocket-root-compat.js`
- `normalpocket.html`
- `manifest.webmanifest`
- `sw-bootstrap.js`
- `sw.js`
- `normalpocket-bootstrap.js`
- `normalpocket-*` business runtime assets
- `metropolis-r5*` legacy presentation/runtime layers
- `app.js`, `domain.js`, `vault.js`, or other NormalPocket business ownership

## PWA identity

`go-hub.webmanifest` is the only published manifest for the GO Hub surface.

Required identity:

- `name`: `GO Hub`
- `short_name`: `GO Hub`
- `id`: `/`
- `start_url`: `/`
- `scope`: `/`
- `display`: `standalone`

NormalPocket's `manifest.webmanifest` is removed from the active publication allowlist and release manifest. It may remain in the repository as legacy reference until later cleanup.

## Service-worker ownership

The existing `go-hub-sw.js` becomes the active service worker. A dedicated `go-hub-sw-bootstrap.js` registers it; active GO Hub HTML must not register legacy `sw.js`.

The GO Hub service worker must:

- use only the `go-hub-app-` cache namespace;
- precache the GO Hub root shell required for offline startup;
- treat `/`, `/index.html`, and `/go-hub.html` as GO Hub navigations;
- fall back to the cached Hub root for those navigations when offline;
- never reference NormalPocket, legacy Metropolis layers, `ygph-standard-app-`, or `ygph-standard-meta`;
- clean obsolete caches only inside its own `go-hub-app-` namespace;
- not include legacy database or business-domain logic.

No compatibility bridge to the old service worker is required. Existing old workers on old clients are allowed to become obsolete after the hard cutover.

## Publication truth

`RELEASE_MANIFEST.json` becomes GO-Hub-only truth. It must stop declaring:

- `compatibility.normalPocket`
- compatibility service-worker mode
- NormalPocket worker name / release identity / database identity
- NormalPocket route
- legacy runtime files in `productionFiles`

The active production file list should contain only the GO Hub shell/runtime/PWA/service-worker assets and any shared static assets that the GO Hub actually uses.

`.assetsignore` must match the same publication truth. Legacy NormalPocket and Metropolis files must not be allowlisted for production publication.

## Repository retirement policy

This phase does **not** mass-delete legacy source files. Files can remain in the repository if they are:

- unreachable from GO Hub active entry points;
- absent from active service-worker shell;
- absent from `RELEASE_MANIFEST.json` production files;
- absent from `.assetsignore` publication allowlist;
- not required by the GO Hub deploy gate except tests that explicitly verify retirement boundaries.

A later cleanup phase may delete retired files after the hard cutover is verified.

## Test strategy

Use TDD. Each behavioral change starts with a failing contract test.

### Contract 1 — root has no compatibility route

Verify `index.html` loads only GO Hub assets and dedicated SW bootstrap, and contains no NormalPocket compatibility script or legacy manifest.

### Contract 2 — dedicated GO Hub service worker owns root offline startup

Verify `go-hub-sw.js` precaches the root Hub shell and maps `/`, `/index.html`, and `/go-hub.html` navigation to cached GO Hub content. Verify it contains no legacy cache or NormalPocket references.

### Contract 3 — publication truth is GO-Hub-only

Verify `RELEASE_MANIFEST.json`, `.assetsignore`, and the active service-worker shell agree on GO Hub production assets and exclude NormalPocket / legacy Metropolis runtime assets.

### Contract 4 — old compatibility is no longer a release requirement

Remove or replace tests whose sole purpose is preserving NormalPocket routing, installed PWA identity, legacy database detection, or offline legacy behavior. Keep business tests only if they still protect source modules retained for reference; they must not define production publication requirements.

### Full verification

Run the existing full gate:

```bash
npm run deploy:gate
```

Before any merge/deploy claim, require a fresh successful GitHub Actions `STANDARD Safety Gate` run at the final branch head.

## Real-device verification after code is green

Because this cutover intentionally abandons NormalPocket compatibility, the real-device gate becomes GO-Hub-only:

1. Online `/` opens GO Hub and reports neutral runtime ready.
2. Reload `/` with the active GO Hub service worker installed.
3. Disable network and reload `/`; GO Hub must still open from its own cache.
4. Re-enable network; the app must recover without redirecting to NormalPocket.

NormalPocket online/offline behavior is not evaluated.

## Non-goals

- migrating NormalPocket data into GO Hub
- preserving `ygph-standard-secure`
- preserving the `normalpocket` Worker name
- preserving legacy service-worker caches
- maintaining `normalpocket.html`
- deleting every legacy file in this phase
- adding MIMIR capabilities or new Hub product features

## Safety / owner gates

- Work remains on `go-hub-foundation`.
- Do not merge PR #14 without a separate explicit owner approval.
- Do not deploy production as part of this implementation phase without a separate explicit owner approval.
- The hard cutover intentionally permits legacy NormalPocket clients to stop working; this is an accepted product decision, not a regression to repair.
