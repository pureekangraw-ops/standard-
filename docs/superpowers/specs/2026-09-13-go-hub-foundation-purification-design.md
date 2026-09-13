# GO Hub Foundation Purification Design

**Date:** 2026-09-13
**Status:** Owner-authorized implementation direction
**Branch:** `go-hub-foundation`
**Base:** `main`

## Goal

Convert the reusable substrate in STANDARD/NormalPocket into a neutral GO Hub foundation without changing production `main`, while preserving NormalPocket-facing behavior behind an explicit compatibility boundary.

## Non-negotiable boundary

```text
Legacy NormalPocket surface
        |
        v
NormalPocket compatibility facade
        |
        v
GO Hub neutral foundation
        |
        +--> future MIMIR capability registry
        +--> future METROPOLIS runtime routes
```

Legacy behavior may depend on GO Hub. GO Hub must not depend on NormalPocket business behavior.

## Keep in the Hub foundation

- controller/dispatch lifecycle
- injected command and persistence ports
- command/evidence and routing concepts
- revision/idempotency/readback discipline
- reusable PWA/service-worker mechanics after identity is separated
- test and release gates

## Keep only in compatibility / legacy ownership

- STORE / LEDGER / CALENDAR business state
- sales, purchases, stock, obligations, shop workflows
- NormalPocket catalog and shop UI
- `ygph-standard-secure` database identity
- `stock-pocket-vault` legacy envelope
- NormalPocket manifest/installed-app identity until an explicit migration phase
- legacy Metropolis presentation/runtime layers until dependency retirement is proven

## First vertical slice

1. Introduce `go-hub-foundation.js` as a neutral controller with injected `applyCommand` and `commitState` ports.
2. Prove by tests that the file contains no NormalPocket domain or storage identity.
3. Introduce `normalpocket-compat.js` as the only adapter that imports the existing `domain.js` and `vault.js` implementations.
4. Keep the old runtime operational while extraction continues.
5. Run the existing `STANDARD Safety Gate` on each PR synchronization.

## Identity strategy

The repository may continue presenting the old external NormalPocket identity during migration. The compatibility surface owns that identity. Hub core must not own:

- Worker name `normalpocket`
- PWA name/id
- IndexedDB name `ygph-standard-secure`
- service-worker cache identities
- NormalPocket business schema

This permits a new Hub UI and orchestration model later without making legacy storage contracts architectural requirements of the Hub.

## Safety constraints

- No direct changes to `main` during extraction.
- No deploy during extraction.
- No destructive deletion until imports, service-worker shell entries, tests, and client persistence dependencies are traced.
- Prefer additive seams and adapters before moves/removals.
- A merge to `main` is a separate owner gate.
