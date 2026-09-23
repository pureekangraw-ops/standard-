# GO Hub Runtime Boundary Map

**Status:** CURRENT COMPATIBILITY MAP  
**Updated:** 2026-09-23  
**Purpose:** Identify the canonical owner of each runtime concern, isolate compatibility baggage, and prevent parallel authorities during migration.

## Classification

| Area | Current evidence | Classification | GO Hub action |
|---|---|---|---|
| `go-hub-foundation.js` | injected `applyCommand` + `commitState`, no legacy imports | FOUNDATION | Keep neutral |
| `go-hub-authority-map.js` | explicit concern → decision-authority ownership | CURRENT AUTHORITY MAP | Use as canonical authority reference |
| `go-hub-heimdall.js` | Hub Evidence Gate + bounded Audit Sentinel production | CURRENT AUTHORITY | Keep evidence decision logic here; consumers must not duplicate it |
| `go-hub-centre*.{js,mjs}` | Work identity/state/distribution/return | CURRENT AUTHORITY | Keep lifecycle ownership here |
| Factory modules | planning/production/assembly/internal QC | CURRENT AUTHORITY | Keep production decisions here |
| `go-hub-counter.mjs` + Notion bridge | knowledge/evidence exchange and production | CURRENT PRODUCER | Do not make Counter a second evidence-sufficiency authority |
| `go-hub-maintenance.js` | health/legacy condition classification | CURRENT CLASSIFIER | Diagnose/classify only; do not own lifecycle/evidence decisions |
| `controller.js` | controller pattern but directly imports `domain.js` + `vault.js` | COMPATIBILITY CANDIDATE | Keep only while proven compatibility dependencies remain; do not extend as a second Hub controller |
| `domain.js` | STORE/LEDGER/CALENDAR commands | NORMALPOCKET DOMAIN | Keep outside Hub core |
| `core.js` | generic helpers mixed with STORE/LEDGER/CALENDAR state/schema | MIXED | Extract helpers only when callers can be migrated atomically; do not copy helpers into a parallel core |
| `vault.js` | persistence mechanics mixed with legacy identities | MIXED / COMPATIBILITY | Preserve compatibility behavior until cutover; do not create a second persistence authority |
| `normalpocket-compat.js` | maps legacy domain + persistence to Hub ports | COMPATIBILITY | Explicit legacy boundary |
| `normalpocket-bootstrap.js` | loads product/catalog/reconcile/simple-flow files | NORMALPOCKET DOMAIN/UI | Keep outside Hub runtime |
| `sw-bootstrap.js` | legacy runtime/bootstrap compatibility | LEGACY RUNTIME BOOTSTRAP | Do not use as Hub authority |
| `app.js` | DB identity, crypto, state, legacy UI/runtime in one large file | LEGACY MONOLITH | Keep operational only while dependencies remain; do not extend as Hub core |
| `manifest.webmanifest` | installed app identity is NormalPocket | COMPATIBILITY IDENTITY | Preserve until explicit installed-app migration |
| service-worker legacy cache/app-shell paths | NormalPocket/Metropolis compatibility assets | LEGACY RUNTIME SHELL | Quarantine as compatibility; migrate consumers before retirement |
| GitHub Actions | deploy/safety gates | FOUNDATION / SAFETY | Verify exact-head changes; CI is corroboration, not decision authority |

## Migration rule: replace, do not accumulate

A migration is complete only when the current owner is unique.

1. Choose the canonical owner for the concern.
2. Move callers to that owner.
3. Verify no active import, runtime route, test contract, deploy contract, backup/import contract, installed-client dependency, or external target still requires the old path.
4. Retire or quarantine the obsolete path.
5. Keep history in Git/archives; do **not** keep two live implementations merely for provenance.

Never solve migration by copying old logic into a new module while leaving both paths authoritative. Temporary compatibility facades are allowed only when they delegate to one owner and carry no independent decision authority.

## Stable compatibility identities

The following may remain temporarily because they are compatibility contracts, not Hub architecture:

- PWA name/short name: `NormalPocket`
- PWA id: `/index.html`
- IndexedDB: `ygph-standard-secure`
- DB store: `kv`
- vault key: `vault`
- legacy vault envelope: `stock-pocket-vault`
- service-worker app cache prefix: `ygph-standard-app-`
- service-worker meta cache: `ygph-standard-meta`
- Worker/deploy target: `normalpocket`

Compatibility preservation does not authorize new GO Hub behavior to be added to these legacy surfaces.

## Stop conditions before destructive retirement

Do not delete or rename a legacy file/path until all relevant checks pass:

- no active import/script reference
- no service-worker app-shell reference
- no regression-test dependency that represents a still-supported contract
- no backup/import contract dependency
- no installed-client migration dependency
- no external Worker/deploy target dependency
- no open canonical Work/PR still using the old path

If proof is incomplete, mark the path compatibility-only and stop extending it.
