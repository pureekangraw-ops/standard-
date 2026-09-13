# GO Hub Foundation Purification Implementation Plan

**Goal:** Establish a neutral GO Hub substrate inside `standard-` while NormalPocket remains behind a compatibility facade.

**Architecture:** Purified Hub Core + Compatibility Facade. Neutral Hub code accepts injected ports and has no direct dependency on NormalPocket business state, storage identity, or UI. Legacy behavior remains callable through `normalpocket-compat.js` until later migration phases retire or relocate it safely.

**Tech stack:** Browser JavaScript, Node.js test runner, GitHub Actions, PWA/service worker.

**Spec:** `docs/superpowers/specs/2026-09-13-go-hub-foundation-purification-design.md`

**Global constraints:** Work only on `go-hub-foundation`; never merge/deploy without separate owner approval; TDD for behavior changes; preserve existing STANDARD regression gate; no destructive move until dependencies are proven.

## Task 1 — Neutral controller boundary

Files:
- Create `go-hub-foundation.js`
- Create `tests/go-hub-foundation-boundary.test.cjs`

Steps:
1. Test that a neutral Hub module exists.
2. Test that it contains no NormalPocket business commands or storage identity.
3. Test that command and commit functions are injected rather than imported from legacy modules.
4. Implement `createHubController` with cloned state, busy protection, injected command port, injected persistence port, readback receipt, and onChange callback.
5. Run `npm run deploy:gate` through PR safety gate.

## Task 2 — NormalPocket compatibility facade

Files:
- Create `tests/normalpocket-compat-boundary.test.cjs`
- Create `normalpocket-compat.js`

Steps:
1. Add failing tests proving legacy imports live outside Hub core.
2. Verify safety gate fails for the missing facade.
3. Implement `createNormalPocketPorts({ store, commandOptions })`.
4. Map Hub `applyCommand` port to legacy `domain.js`.
5. Map Hub `commitState` port to legacy `vault.js` with the existing action name.
6. Verify safety gate returns green.

## Task 3 — Make new boundary part of syntax gate

Files:
- Modify `package.json`

Steps:
1. Add `go-hub-foundation.js` and `normalpocket-compat.js` to `check:syntax`.
2. Run full safety gate through PR workflow.

## Task 4 — Runtime contamination map

Files:
- Inspect `sw-bootstrap.js`, `sw.js`, `app.js`, `manifest.webmanifest`, `RELEASE_MANIFEST.json`.
- Create `docs/go-hub/runtime-boundary-map.md`.

Steps:
1. Classify each runtime identity as FOUNDATION / COMPATIBILITY / NORMALPOCKET DOMAIN / LEGACY VERIFY.
2. Record installed-app identity, Worker target, DB/vault identity, cache lifecycle, bootstrap chain, and UI/runtime layers.
3. Identify exact files that prevent the repository root runtime from becoming Hub-neutral.
4. Do not modify those identities yet.

## Task 5 — Neutral runtime bootstrap seam

Files:
- Create `tests/go-hub-runtime-boundary.test.cjs`
- Create `go-hub-runtime.js`

Steps:
1. Test that the neutral runtime bootstrap does not load NormalPocket or Metropolis legacy layers.
2. Test that runtime features are injected/registered rather than hard-coded.
3. Verify RED in GitHub Actions.
4. Implement minimal runtime registry/bootstrap.
5. Verify GREEN in GitHub Actions.

## Task 6 — Review boundary before destructive moves

Steps:
1. Compare `main...go-hub-foundation`.
2. Inspect all changed files and PR diff.
3. Confirm legacy app remains untouched by additive extraction.
4. Keep PR draft.
5. Stop before merge, deploy, file deletion, Worker rename, PWA identity change, IndexedDB migration, or service-worker cache migration.
