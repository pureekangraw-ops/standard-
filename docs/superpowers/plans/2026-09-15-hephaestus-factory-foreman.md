# Hephaestus Factory Foreman Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic Factory foreman that serializes Assembly and Merge work per repository, evaluates queue risk, requires current gate evidence, and returns completed work to Optician.

**Architecture:** Add one focused pure module, `go-hub-hephaestus.js`, that owns only Factory admission/queue policy. Existing Ready Gate/QC/verification modules remain the truth for correctness; callers supply those facts to Hephaestus. V0 is deliberately not wired to GitHub mutation execution until the server-authoritative Factory Controller seam is reconciled on current main.

**Tech Stack:** JavaScript ES modules, Node `node:test`, existing GO Hub evidence/QC conventions.

**Spec:** `docs/superpowers/specs/2026-09-15-hephaestus-factory-foreman-design.md`

## Global Constraints

- One repository has one Assembly slot and one Merge slot.
- Each slot has at most one active GO.
- One GO actively owns at most one Hephaestus slot.
- Queue is FIFO.
- Waiting work returns a report instead of occupying an active slot.
- Existing QC is reused, never duplicated.
- Merge risk fails closed: conflict/dependency risk = BLOCKED; overlap/stale projection = RECHECK.
- Successful Merge release requires post-merge verification and returns to Optician.
- No direct GitHub mutation wiring in this slice.

---

### Task 1: Foreman slot and queue core

**Files:**
- Create: `go-hub-hephaestus.js`
- Test: `tests/go-hub-hephaestus.test.cjs`

**Interfaces:**
- Produces: `createHephaestusState()`, `requestFactorySlot(state, request)`, `releaseFactorySlot(state, release)`.
- State contains repository-local `assembly` and `merge` lanes with `active` and FIFO `queue`.

- [ ] **Step 1: Write failing tests** proving first GO becomes ACTIVE, second GO for the same repo/slot becomes QUEUED, different repos are independent, and one GO cannot actively own two slots.
- [ ] **Step 2: Run `node --test tests/go-hub-hephaestus.test.cjs`** and confirm failure because the module does not exist.
- [ ] **Step 3: Implement the minimal immutable state transitions** with slot names limited to `assembly` and `merge`.
- [ ] **Step 4: Run the focused test** and confirm green.
- [ ] **Step 5: Commit** `feat: add Hephaestus factory slot queues`.

### Task 2: Gate evidence and queue-risk policy

**Files:**
- Modify: `go-hub-hephaestus.js`
- Modify: `tests/go-hub-hephaestus.test.cjs`

**Interfaces:**
- Produces: `evaluateQueueRisk(input)`, `evaluateFactoryAdmission(input)`.
- `evaluateQueueRisk({ conflict, overlappingPaths, dependencyRisks, staleBase })` returns `{status: "SAFE"|"RECHECK"|"BLOCKED", reasons: string[]}`.
- `evaluateFactoryAdmission({ slot, readyGate, assembly, assemblyQc, pullRequest, ci, risk })` returns `{decision: "ADMIT"|"WAIT"|"BLOCK", reasons: string[]}`.

- [ ] **Step 1: Write failing tests** for exact Ready Gate head before Assembly; exact PR/CI/Assembly-QC head plus SAFE risk before Merge; overlap/stale => RECHECK; conflict/dependency risk => BLOCKED.
- [ ] **Step 2: Run focused test** and verify expected RED failures.
- [ ] **Step 3: Implement minimal evaluators** without calling GitHub or QC modules.
- [ ] **Step 4: Run focused test** and confirm green.
- [ ] **Step 5: Commit** `feat: add Hephaestus admission and queue risk gates`.

### Task 3: Waiting report, slot handoff, and Optician return

**Files:**
- Modify: `go-hub-hephaestus.js`
- Modify: `tests/go-hub-hephaestus.test.cjs`

**Interfaces:**
- Produces: `createQueueReport(state, {repository, slot, jobId})`, `completeMergeAndReturn(state, input)`.
- Queue report action is `RETURN_TO_CHAT`.
- Successful merge completion requires `postMergeVerification.status === "pass"` and returns `{destination:"optician", reason:"FACTORY_REALITY_CHANGED", ...}`.
- Release promotes the next FIFO job to `active` but marks it `NEEDS_RECHECK`; it is not merge-admitted until current preflight evidence is supplied.

- [ ] **Step 1: Write failing tests** for queue position/ahead metadata, post-merge verification requirement, Optician return packet, FIFO promotion with `NEEDS_RECHECK`.
- [ ] **Step 2: Run focused test** and verify RED.
- [ ] **Step 3: Implement report/completion/promotion logic**.
- [ ] **Step 4: Run focused test** and confirm green.
- [ ] **Step 5: Commit** `feat: return queued and completed Factory work safely`.

### Task 4: Repository safety-gate integration

**Files:**
- Modify: `package.json`
- Test: all existing tests plus syntax gate.

**Interfaces:**
- `npm run check:syntax` must include `go-hub-hephaestus.js`.

- [ ] **Step 1: Add a failing source-presence/syntax expectation if required by repository convention, then update `check:syntax` to include `go-hub-hephaestus.js`.**
- [ ] **Step 2: Run `npm test`.** Expected: all tests pass.
- [ ] **Step 3: Run `npm run check:syntax`.** Expected: pass including Hephaestus.
- [ ] **Step 4: Run `npm run deploy:gate`.** Expected: pass.
- [ ] **Step 5: Commit** `chore: gate Hephaestus in repository checks`.

### Task 5: Review and PR

**Files:**
- No production code unless review finds a defect.

- [ ] **Step 1: Compare branch against current `main`** and confirm only Hephaestus/spec/plan/test/syntax-gate changes are present.
- [ ] **Step 2: Recheck that current main has not advanced; if it has, reconcile before PR validation.**
- [ ] **Step 3: Open PR** describing V0 scope and the intentional no-mutation-wiring boundary.
- [ ] **Step 4: Confirm CI against the exact PR head.**
- [ ] **Step 5: Do not merge until exact-head CI is green and the controller-authority seam for future wiring is explicitly preserved.
