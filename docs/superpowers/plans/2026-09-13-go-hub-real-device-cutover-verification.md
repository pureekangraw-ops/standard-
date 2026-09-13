# GO Hub Real-Device Cutover Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit verification gate for the GO Hub root cutover so fresh clients, legacy NormalPocket clients, and offline legacy clients are all proven safe before merge/deploy.

**Architecture:** Keep the route decision pure in `go-hub-root-route.js` and the compatibility service worker as the active transition bridge. Add one CI regression contract that binds the three device scenarios together, plus a device runbook that records the exact manual evidence required. Do not activate `go-hub-sw.js`, rename the Worker, change the legacy IndexedDB identity, merge, or deploy in this phase.

**Tech Stack:** Node.js 22 test runner, ES modules, existing compatibility `sw.js`, Markdown runbook.

**Spec:** `docs/superpowers/specs/2026-09-13-go-hub-foundation-purification-design.md`

## Global Constraints

- Work only on `go-hub-foundation`; `main` stays unchanged.
- `ygph-standard-secure` remains the NormalPocket compatibility database identity.
- Worker name `normalpocket`, cache prefix `ygph-standard-app-`, and release identity stay compatibility-owned.
- Root cutover cache generation must not auto-activate over installed clients.
- No merge or deploy in this phase.

---

### Task 1: Bind the three real-device scenarios into CI

**Files:**
- Create: `tests/go-hub-real-device-cutover.test.cjs`
- Test: `tests/go-hub-real-device-cutover.test.cjs`

**Interfaces:**
- Consumes: `chooseRootDestination(options)` from `go-hub-root-route.js`, and `APP_SHELL`, `CACHE_GENERATION`, `shouldAutoActivateCurrentGeneration()`, `offlineLookupKeys(request)` from `sw.js`.
- Produces: one regression gate proving fresh, legacy, and offline-legacy behavior together.

- [ ] **Step 1: Write the failing test**

The test must require `docs/go-hub/real-device-cutover-verification.md` before it exists, assert `canInspectLegacy=true + legacyData=false -> HUB`, assert legacy data and uninspectable state -> `LEGACY`, and assert offline `/normalpocket.html` resolves only to `normalpocket.html` while the cutover cache is non-auto-activating.

- [ ] **Step 2: Run the full `STANDARD Safety Gate` and verify RED**

Run through GitHub Actions for the PR head. Expected failure: missing real-device runbook; existing unrelated tests remain green.

- [ ] **Step 3: Add the minimal runbook required by the contract**

Create `docs/go-hub/real-device-cutover-verification.md` with three named scenarios, expected route, online/offline action, pass evidence, and explicit STOP conditions.

- [ ] **Step 4: Run the full gate and verify GREEN**

Expected: `npm run deploy:gate` succeeds with zero failing tests.

### Task 2: Make device evidence deterministic

**Files:**
- Create: `docs/go-hub/real-device-cutover-verification.md`
- Test: `tests/go-hub-real-device-cutover.test.cjs`

**Interfaces:**
- Consumes: current active cutover contract from `RELEASE_MANIFEST.json` and compatibility identities from `sw.js`/`normalpocket-root-compat.js`.
- Produces: a repeatable owner-facing checklist for one fresh profile/device state and one installed legacy state.

- [ ] **Step 1: Record exact pass criteria**

Fresh client: opening `/` lands on GO Hub and does not load NormalPocket business runtime. Legacy client: opening `/` routes to `/normalpocket.html` with existing data still readable. Offline legacy client: after the compatibility shell is cached, `/normalpocket.html` remains the offline navigation target and does not fall through to Hub root.

- [ ] **Step 2: Record exact STOP criteria**

STOP if existing data is missing, root loops/reloads, legacy client lands on GO Hub without explicit `?hub=1`, offline legacy navigation returns Hub root, or the new root-cutover cache auto-activates unexpectedly.

- [ ] **Step 3: Require device evidence before merge/deploy**

The runbook must state that CI GREEN is necessary but not sufficient; merge/deploy remains blocked until the owner reports the three device results.

### Task 3: Stop at the physical-device gate

**Files:**
- No production-code changes.

**Interfaces:**
- Consumes: GREEN Safety Gate plus completed runbook.
- Produces: an explicit handoff requesting only the observations that cannot be simulated from GitHub Actions.

- [ ] **Step 1: Verify PR remains Draft/open and unmerged**

- [ ] **Step 2: Verify latest `STANDARD Safety Gate` is GREEN**

- [ ] **Step 3: Stop before merge, deploy, Worker handoff, or dedicated `go-hub-sw.js` activation**
