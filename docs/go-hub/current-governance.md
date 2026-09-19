# GO Hub Current Governance

**Status:** CURRENT  
**Updated:** 2026-09-19  
**Scope:** Centre routing / repository-operation governance

## Current operating contract

1. **Work ID is the durable identity of work.** A chat room or UI session may receive, continue, return, or resume the same Work ID without becoming part of the Work identity.
2. **Room ID is not required governance.** Centre, Factory, and repository-operation contracts must not require a room identifier in order to continue existing work.
3. **Checkpoint ID is the return point for a Work passage.** Return Address must match the Checkpoint ID; it is not a replacement for Work ID.
4. **Centre uses Role fitting.** The live Centre contract fits `roleId`, `roleReference`, and `workingView`.
5. **Legacy Lens fitting is not current.** Live Centre rejects legacy `lensId`, `lensReference`, and `fittedView` fit inputs with `LEGACY_LENS_CONTRACT_REJECTED`.
6. **Repository mutation follows the governed GO Hub route.** Work must carry its original Work ID / Checkpoint ID / Return Address and leave Centre for the canonical Factory destination before source changes.
7. **Routine repository edits happen on a task branch.** Do not treat historical design documents as permission to write directly to `main`.
8. **Historical governance stays auditable but non-authoritative.** Superseded Lens/Optician design text is kept for provenance and is mirrored in the owner Drive archive **GO Governance — Superseded Rules — 2026-09-19**.
9. **Current code truth wins over old handoff prose.** If a historical plan conflicts with live Centre/runtime contracts, use the live contract and classify the old text as historical evidence.

## Pin identity routing

The first owner command locks the Pin identity policy for that request chain:

- **Continue / edit** → resolve and reuse the existing Pin.
- **Continue / edit + archived Pin** → reopen the same Pin before further work.
- **Continue / edit + unresolved Pin identity** → lookup/review is required; do not silently create a replacement Pin.
- **Create / start new** → create a new Pin.
- Board content stays flexible. This routing policy protects identity/history; it does not restrict what kinds of information may be pinned.

## Current code evidence

- `go-hub-centre-live.mjs` — Work ID / Checkpoint ID / Return Address lifecycle; no Room ID requirement.
- `go-hub-centre.js` — durable Centre Work lifecycle.
- `go-hub-route-contract.js` — canonical destination and Work Context validation.
- `go-hub-factory-return.js` — Factory Work Context derives from Centre identity.
- `go-hub-board-pin-route.js` — sticky first-command Pin identity routing.
- `go-hub-housekeeper.js` — source-bound closeout planning; no implicit deletion.

## Historical documents

The following files are intentionally retained as historical design evidence and must not be used as current governance:

- `docs/superpowers/specs/2026-09-14-go-hub-code-station-engine-map-design.md`
- `docs/superpowers/plans/2026-09-15-go-city-optician-v1.md`
- `docs/superpowers/specs/2026-09-15-hephaestus-factory-foreman-design.md`

Their original pre-housekeeping snapshots were archived before these warning headers were added.
