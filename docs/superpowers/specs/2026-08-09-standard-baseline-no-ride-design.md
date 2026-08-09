# STANDARD Baseline — METROPOLIS 4.2.3 without RIDE

Date: 2026-08-09
Status: Approved design draft for owner review
Source baseline: `pureekangraw-ops/ygph-metropolis` at current METROPOLIS 4.2.3
Target repository: `pureekangraw-ops/standard-`

## Goal

Create a clean STANDARD baseline by copying the current METROPOLIS 4.2.3 application into the new repository and removing the RIDE domain completely.

The target should remain recognizably the same application foundation, with the same core security, persistence, calendar, ledger, store, history/reporting, settings, import/export, dashboard, and offline behavior, but with no RIDE feature or RIDE data model left behind.

## Keep

- Home dashboard
- Store
- Ledger / money
- Calendar / action queue
- Reports / history
- Settings
- IndexedDB Vault persistence
- PBKDF2 + AES-GCM encryption flow
- Import / export contracts for retained domains
- Service Worker / offline shell
- Current navigation and current visual system
- Current safety / integrity checks that apply to retained domains

## Remove completely

- RIDE app card / page / navigation
- `state.ride`
- ride rounds
- ride jobs
- ride expenses
- ride credit balance and withdrawals
- RIDE calendar action/source handling
- RIDE import/export records and transforms
- RIDE-specific migration logic
- RIDE-specific validation and reports
- RIDE-specific tests, labels, text, and dashboard references

The target must not merely hide RIDE in the UI. RIDE must not remain as a dormant runtime or persistence dependency.

## Data boundary

This is a source-code baseline copy only.

Do not copy the owner's current browser Vault, IndexedDB data, obligations, calendar records, money state, stock state, audit history, imported records, backups, secrets, Cloudflare credentials, or any other personal runtime data into `standard-`.

A fresh STANDARD installation starts with an empty new Vault/state using only the retained domains.

## Implementation approach

Use the existing 4.2.3 code as the source of truth and remove RIDE in place rather than rebuilding the app from scratch.

Work in this order:

1. Copy the application source and build/release support files required by the retained app.
2. Remove RIDE from HTML/navigation and user-visible strings.
3. Remove RIDE from default state and normalization.
4. Remove RIDE mutation/business logic and calendar/source routing.
5. Remove RIDE import/export and migration dependencies.
6. Remove RIDE reports and tests.
7. Repair any retained-domain references that assumed RIDE existed.
8. Run focused tests for boot, Vault unlock/create, Store, Ledger, Calendar, import/export, navigation, and offline shell.
9. Search the target repository for remaining executable `ride` / `RIDE` references; remaining references are allowed only in migration notes or explicit documentation explaining removal, if needed.

## Compatibility rule

STANDARD is a new product baseline, not a migration target for an existing METROPOLIS Vault. We do not guarantee that a Vault containing RIDE data from METROPOLIS can be imported directly into STANDARD.

Retained-domain YGPH_EXCHANGE records may remain compatible only where their source/type contracts do not depend on RIDE.

## Versioning

Do not present the new repository as METROPOLIS 4.2.3 production. Give STANDARD its own visible product/release identity during implementation while preserving attribution to the 4.2.3 source baseline in documentation.

## Deployment scope

Repository baseline comes first. Do not reuse the production METROPOLIS Cloudflare Worker name, production URL, secrets, or cache namespace by accident.

Deployment of STANDARD is a separate step after the repository passes its focused gate.

## Success criteria

- App boots and creates/unlocks a fresh encrypted Vault.
- No RIDE page/card/menu exists.
- Fresh durable state has no `ride` property.
- No retained action, queue, import/export path, or report requires RIDE.
- Store, Ledger, Calendar, Reports/History, Settings, Dashboard, import/export, and offline shell still work.
- No personal METROPOLIS runtime data is present in the repository.
- Focused gate passes before any STANDARD deployment.

## Non-goals

- Redesigning the UI.
- Refactoring unrelated METROPOLIS architecture.
- Migrating the owner's live METROPOLIS data.
- Deploying over the existing METROPOLIS Worker.
- Adding new STANDARD features in this pass.
