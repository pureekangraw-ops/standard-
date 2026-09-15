# GO City Runtime/Publication Round-trip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the actively published GO Hub carry the exact Centre work identity into Factory/Code and return real Factory reality instead of the synthetic `returned-by-operator` payload.

**Architecture:** Reuse the already-merged `createFactoryWorkContext()` and `createFactoryRealityReturn()` boundary. Wire those helpers into `go-hub-shell.js`, keep Code registration gated by exact Factory access, then publish/cache/syntax-check the Factory return module as part of the active Hub runtime. Do not activate Optician/city-route in this PR.

**Tech Stack:** JavaScript ES modules, Node `node:test`, GO Hub PWA/service-worker publication contract, GitHub Actions exact-head verification through GO Hub Factory.

**Spec:** `docs/superpowers/specs/2026-09-16-go-city-runtime-publication-roundtrip-design.md`

## Global Constraints

- Preserve exact Centre `workId`, `checkpointId`, `returnAddress`, task, requested result, and lens reference.
- Factory destination remains `destination://factory`.
- Replace only the synthetic operator return path; do not add a parallel protocol.
- `go-hub-factory-return.js` must be actively published wherever active runtime files are enumerated.
- Do not publish `go-hub-city-route.js` or Optician merely because they exist in the repository.
- RED evidence must precede implementation; GREEN evidence must be bound to the exact branch head.

---

### Task 1: Add a failing runtime round-trip contract

**Files:**
- Create: `tests/go-hub-runtime-roundtrip.test.cjs`
- Inspect: `go-hub-shell.js`
- Reuse: `go-hub-factory-return.js`, `go-hub-centre.js`, `go-hub-code-module.js`

**Interfaces:**
- Consumes: `createFactoryWorkContext(access, taskSnapshot)`, `createFactoryRealityReturn(access, taskSnapshot)`, `createCodeCapability({ workspace, task, workContext })`.
- Produces: a static active-shell contract proving the real Factory return helpers are imported and the placeholder `returned-by-operator` is absent.

- [x] **Step 1: Write the failing test**

```js
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const shell = fs.readFileSync(path.join(root, "go-hub-shell.js"), "utf8");

test("active shell binds Factory work context and returns real Factory reality", () => {
  assert.match(shell, /createFactoryWorkContext/);
  assert.match(shell, /createFactoryRealityReturn/);
  assert.match(shell, /workContext/);
  assert.equal(shell.includes("returned-by-operator"), false);
});
```

- [ ] **Step 2: Verify RED on the exact test-only branch head**

Run via repository CI after committing only this test. Expected: `STANDARD Safety Gate` fails because current `go-hub-shell.js` contains `returned-by-operator` and does not use the Factory return helpers.

- [ ] **Step 3: Stop at RED and record the failing workflow/run evidence before implementation.**

### Task 2: Wire the real runtime round-trip

**Files:**
- Modify: `go-hub-shell.js`
- Test: `tests/go-hub-runtime-roundtrip.test.cjs`

**Interfaces:**
- Consumes: exact Factory access from `admitDestination()`.
- Produces: `workContext = createFactoryWorkContext(access, task.snapshot())`, Code capability created with that context, and return packet from `createFactoryRealityReturn(access, task.snapshot())`.

- [ ] **Step 1: Import the existing helpers**

```js
import { createFactoryRealityReturn, createFactoryWorkContext } from "./go-hub-factory-return.js";
```

- [ ] **Step 2: Build Code capability from current Factory access**

Refactor capability creation so the Factory-access path creates:

```js
const access = admitDestination(centreWork, {
  destination: FACTORY_DESTINATION,
  capability: baseCodeCapability,
});
const workContext = createFactoryWorkContext(access, task.snapshot());
const boundCodeCapability = createCodeCapability({ workspace, task, workContext });
runtime.register("Code", boundCodeCapability);
```

The non-AWAY runtime must not retain Code registration.

- [ ] **Step 3: Replace the synthetic return**

In the `CENTRE_STATES.AWAY` submit branch, create exact access and return:

```js
centreWork = centre.return(
  centreWork,
  createFactoryRealityReturn(access, task.snapshot()),
);
```

Remove every executable occurrence of `returned-by-operator`.

- [ ] **Step 4: Verify focused round-trip test passes on the new exact head.**

### Task 3: Publish the Factory return module

**Files:**
- Modify: `RELEASE_MANIFEST.json`
- Modify: `.assetsignore`
- Modify: `go-hub-sw.js`
- Modify: `package.json`
- Modify: `tests/go-hub-active-publication.test.cjs`
- Test: `tests/go-hub-publication-seam.test.cjs`

**Interfaces:**
- Consumes: active publication file-list conventions already used by GO Hub.
- Produces: `go-hub-factory-return.js` available offline/production and covered by syntax/publication parity gates.

- [ ] **Step 1: Add `go-hub-factory-return.js` to the active publication test list** and require it in the service-worker/cache contract.
- [ ] **Step 2: Add the same file to `RELEASE_MANIFEST.json` `productionFiles`.**
- [ ] **Step 3: Add `!/go-hub-factory-return.js` to `.assetsignore`.**
- [ ] **Step 4: Add `go-hub-factory-return.js` to the service-worker precache list in `go-hub-sw.js`.**
- [ ] **Step 5: Add `go-hub-factory-return.js` to `package.json` `check:syntax`.**
- [ ] **Step 6: Run focused publication/runtime tests through exact-head CI. Expected: all green.**

### Task 4: PR and exact-head verification

**Files:**
- No new implementation files.

**Interfaces:**
- Consumes: exact branch head with green CI.
- Produces: PR-C ready for Hephaestus merge ownership and post-merge Production Reality verification.

- [ ] **Step 1: Compare branch to `main`; confirm scope contains only PR-C spec/plan/test/runtime/publication files.**
- [ ] **Step 2: Read exact-head CI; require all current-head signals completed/success.**
- [ ] **Step 3: Open PR-C with the same `workContext`.**
- [ ] **Step 4: Request Hephaestus merge slot only with exact PR head, matching CI, SAFE risk, and same Centre work identity.**
- [ ] **Step 5: Merge only through GO Hub Factory ownership gate.**
- [ ] **Step 6: Verify new main exact SHA has successful Safety Gate and GO Hub Deploy before releasing Hephaestus and starting PR-D Production Reality.**
