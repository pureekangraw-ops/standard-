# GO Hub Runtime Boundary Map

**Branch:** `go-hub-foundation`
**Purpose:** Record what is reusable substrate versus compatibility/domain baggage before any destructive move.

## Classification

| Area | Current evidence | Classification | GO Hub action |
|---|---|---|---|
| `go-hub-foundation.js` | injected `applyCommand` + `commitState`, no legacy imports | FOUNDATION | Keep neutral |
| `controller.js` | controller pattern but directly imports `domain.js` + `vault.js` | COMPATIBILITY CANDIDATE | Supersede with neutral controller, retain while legacy app needs it |
| `domain.js` | STORE/LEDGER/CALENDAR commands | NORMALPOCKET DOMAIN | Keep outside Hub core |
| `core.js` | generic helpers mixed with STORE/LEDGER/CALENDAR state/schema | MIXED | Split reusable helpers later; do not make it Hub core as-is |
| `vault.js` | reusable crypto/store mechanics mixed with `ygph-standard-secure`, `stock-pocket-vault`, NormalPocket state validation | MIXED / COMPATIBILITY | Split generic persistence mechanics later; preserve legacy envelope here |
| `normalpocket-compat.js` | maps legacy domain + persistence to Hub ports | COMPATIBILITY | Explicit legacy boundary |
| `normalpocket-bootstrap.js` | loads product/catalog/reconcile/simple-flow files | NORMALPOCKET DOMAIN/UI | Keep outside Hub runtime |
| `sw-bootstrap.js` | loads Metropolis presentation layers then NormalPocket bootstrap | LEGACY RUNTIME BOOTSTRAP | Do not use as Hub bootstrap |
| `app.js` | owns DB identity, crypto, state, legacy UI/runtime in one large file | LEGACY MONOLITH | Keep operational but do not extend as Hub core |
| `manifest.webmanifest` | installed app identity is NormalPocket, id `/index.html` | COMPATIBILITY IDENTITY | Preserve until explicit installed-app migration |
| `sw.js` cache prefix | `ygph-standard-app-`, meta `ygph-standard-meta` | COMPATIBILITY IDENTITY | Preserve until cache migration is designed |
| `sw.js` app shell | includes NormalPocket + Metropolis assets | LEGACY RUNTIME SHELL | Hub must receive its own shell later |
| GitHub Actions | PR runs `npm run deploy:gate` | FOUNDATION / SAFETY | Keep; extend to Hub files |

## Exact contamination points currently blocking a Hub-neutral root runtime

1. `sw-bootstrap.js` hard-codes Metropolis R5 layers and `normalpocket-bootstrap.js`.
2. `sw.js` pre-caches NormalPocket and historical Metropolis assets as the single app shell.
3. `manifest.webmanifest` exposes NormalPocket as the installed PWA identity.
4. `app.js` duplicates data/storage/domain/UI responsibilities and hard-codes `ygph-standard-secure`.
5. `core.js` defines the NormalPocket STORE/LEDGER/CALENDAR state shape.
6. `vault.js` validates that business state and preserves NormalPocket/Stock Pocket vault identity.
7. `package.json` and CI are named around NormalPocket/STANDARD and syntax-check only the legacy runtime by default.

## Stable legacy identities to preserve during migration

- PWA name/short name: `NormalPocket`
- PWA id: `/index.html`
- IndexedDB: `ygph-standard-secure`
- DB store: `kv`
- vault key: `vault`
- legacy vault envelope: `stock-pocket-vault`
- service-worker app cache prefix: `ygph-standard-app-`
- service-worker meta cache: `ygph-standard-meta`
- Worker/deploy target: `normalpocket` (documented outside runtime source)

These identities are compatibility contracts, not Hub architecture.

## Safe extraction order

1. Neutral controller + legacy facade (implemented first).
2. Neutral runtime registry/bootstrap, still inactive.
3. Generic utility extraction from `core.js` without changing existing imports.
4. Generic persistence port/mechanics extraction from `vault.js` without changing legacy DB/vault identity.
5. New Hub UI/runtime shell.
6. Only after dependency proof: move or retire legacy files.
7. Installed-app/Worker/cache/storage migration is a separate phase and owner gate.

## Stop conditions before destructive moves

Do not delete or rename legacy files until all of the following are proven:

- no active import/script reference
- no service-worker APP_SHELL reference
- no regression test dependency
- no backup/import contract dependency
- no installed-client migration dependency
- no external Worker/deploy target dependency
