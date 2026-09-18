# GO Hub Current Governance

**Status:** CURRENT  
**Updated:** 2026-09-19  
**Scope:** Centre routing / repository-operation governance

## Current operating contract

1. **Centre uses Role fitting.** The live Centre contract fits `roleId`, `roleReference`, and `workingView`.
2. **Legacy Lens fitting is not current.** Live Centre rejects legacy `lensId`, `lensReference`, and `fittedView` fit inputs with `LEGACY_LENS_CONTRACT_REJECTED`.
3. **Repository mutation follows the governed GO Hub route.** Work must carry its original Work ID / Checkpoint ID / Return Address and leave Centre for the canonical Factory destination before source changes.
4. **Routine repository edits happen on a task branch.** Do not treat historical design documents as permission to write directly to `main`.
5. **Historical governance stays auditable but non-authoritative.** Superseded Lens/Optician design text is kept for provenance and is mirrored in the owner Drive archive **GO Governance — Superseded Rules — 2026-09-19**.
6. **Current code truth wins over old handoff prose.** If a historical plan conflicts with live Centre/runtime contracts, use the live contract and classify the old text as historical evidence.

## Current code evidence

- `go-hub-centre-live.mjs` — Role fitting and explicit rejection of legacy Lens fit inputs.
- `go-hub-centre.js` — durable Centre Work lifecycle.
- `go-hub-route-contract.js` — canonical destination and Work Context validation.
- `go-hub-housekeeper.js` — source-bound closeout planning; no implicit deletion.

## Historical documents

The following files are intentionally retained as historical design evidence and must not be used as current governance:

- `docs/superpowers/specs/2026-09-14-go-hub-code-station-engine-map-design.md`
- `docs/superpowers/plans/2026-09-15-go-city-optician-v1.md`
- `docs/superpowers/specs/2026-09-15-hephaestus-factory-foreman-design.md`

Their original pre-housekeeping snapshots were archived before these warning headers were added.
