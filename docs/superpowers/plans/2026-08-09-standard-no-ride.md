# STANDARD No-RIDE Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a clean STANDARD baseline from METROPOLIS 4.2.4 commit `7329448eef685d72364c42f8d0373483e6e303d0`, preserving shared Store/Ledger/Calendar/Vault/offline behavior while removing RIDE completely.

**Architecture:** Copy the verified METROPOLIS source baseline into `standard-`, then remove RIDE at the UI, durable-state, business-logic, import/export, reporting, migration, validation, test, and release layers. STANDARD gets its own product/cache identity and must not share METROPOLIS deployment names or browser data.

**Tech Stack:** Vanilla JavaScript, IndexedDB, Web Crypto, Service Worker, Node test runner, Cloudflare Wrangler config.

## Global Constraints

- METROPOLIS upstream baseline is exactly `7329448eef685d72364c42f8d0373483e6e303d0` / product 4.2.4.
- Do not copy personal browser Vault/IndexedDB/runtime data, backups, secrets, or Cloudflare credentials.
- Remove RIDE completely; do not merely hide it.
- Keep Store, Ledger, Calendar, Reports/History, Settings, dashboard, encrypted Vault, import/export for retained domains, and offline shell.
- STANDARD must use its own visible product identity, database/cache namespace, Worker name, and release metadata.
- No deployment in this pass.

---

### Task 1: Copy the verified upstream baseline

**Files:**
- Copy the current METROPOLIS production/runtime files and repository gate support from source commit `7329448e...`.
- Preserve `docs/superpowers/specs/2026-08-09-standard-baseline-no-ride-design.md` and this plan.

**Interfaces:**
- Consumes: METROPOLIS 4.2.4 stable runtime.
- Produces: a buildable STANDARD working tree before RIDE removal.

- [ ] Copy source files without runtime/personal data.
- [ ] Record the exact upstream commit in STANDARD release documentation.

### Task 2: Remove RIDE end-to-end

**Files:**
- Modify: `index.html`, `app.js`, `flow-era.js`, `flow-era-3.5.js`, `metropolis-v4.js`, `metropolis-r5.js`, `metropolis-r5-1.js`, `metropolis-r5-2.js`, `metropolis-r5-3.js`, `metropolis-r5-4.js` as required by actual references.
- Modify retained CSS only where RIDE selectors/variables are no longer needed.
- Modify tests to assert no executable RIDE surface remains.

**Interfaces:**
- Removes: `state.ride`, Ride UI/navigation, rounds/jobs/expenses/credit, RIDE queue/source handlers, RIDE import/export/report paths.
- Preserves: Store/Ledger/Calendar/Vault contracts.

- [ ] Add a failing STANDARD regression test asserting no Ride launcher/page and no `ride` property in fresh state.
- [ ] Remove RIDE UI/navigation and fresh-state fields.
- [ ] Remove RIDE business logic, source routing, import/export, reports, migration normalization, and validators.
- [ ] Update retained helpers so they no longer assume RIDE exists.
- [ ] Search executable source for `ride` / `RIDE`; only explicit migration/removal documentation may remain.

### Task 3: Give STANDARD its own runtime identity

**Files:**
- Modify: `manifest.webmanifest`, `sw.js`, `wrangler.jsonc`, `RELEASE_MANIFEST.json`, visible-version runtime, package/release tests.

**Interfaces:**
- Produces: STANDARD product name, distinct IndexedDB/cache/Worker identifiers, and release metadata that cites METROPOLIS 4.2.4 as upstream.

- [ ] Rename visible product identity to STANDARD.
- [ ] Use distinct database/cache/Worker names so STANDARD cannot collide with METROPOLIS local or Cloudflare state.
- [ ] Keep deploy disabled/not performed.

### Task 4: Focused gate

**Files:**
- Test retained production behavior and no-RIDE contract.

- [ ] Run syntax and UTF-8 checks.
- [ ] Run focused/full available Node tests for fresh Vault, Store, Ledger, Calendar, import/export, navigation, dashboard, and offline shell.
- [ ] Confirm no executable RIDE references remain.
- [ ] Open PR to `standard-/main`; merge only if the gate is green.
