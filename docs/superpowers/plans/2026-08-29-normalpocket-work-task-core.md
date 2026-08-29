# NormalPocket Work / Task Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and prove a portable host-neutral Work / Task Core in NormalPocket without changing existing Calendar/finance behavior or deploying it to production.

**Architecture:** `normalpocket-work-core.js` is a pure UMD/CommonJS-compatible domain module. `normalpocket-work-adapter.js` maps that contract into a host-owned `state.work.tasks` collection but performs no storage writes. Existing NormalPocket production persistence remains untouched. Durable acceptance is proven only through `tests/helpers/isolated-durable-store.cjs`, a test-only filesystem store with explicit namespace/database/key, sync, close/reopen, deep readback, and a hard guard against `ygph-standard-secure`.

**Tech Stack:** JavaScript, Node.js 22 built-in test runner, Node filesystem APIs for test-only durable proof, existing `npm run deploy:gate`.

**Spec:** `docs/superpowers/specs/2026-08-29-normalpocket-work-task-core-design.md`

## Global Constraints

- Base source inspected at `d74882d308d19df00ecb6c5ad4b0362df9cdcdfa`.
- Do not modify existing `state.calendar` semantics, STORE/LEDGER money effects, Vault/IndexedDB data ownership, service-worker release identity, or LIGHT HOUSE Intent.
- Owner-authorized first query contract is exactly `id / status / dueFrom / dueTo`; unsupported filters must be rejected.
- No live user data is used for tests.
- Never use production database identity `ygph-standard-secure` in durable proof.
- No merge or deploy is part of this plan; final state is a reviewed branch/PR ready for owner decision.
- Every behavior change follows RED → GREEN before review.

---

### Task 1: Core identity, validation, edit, and query

**Files:**
- Create: `tests/work-task-core.test.cjs`
- Create: `normalpocket-work-core.js`

**Interfaces:**
- Produces: `createTask(input, context)`, `editTask(task, patch, context)`, `getTask(tasks, id)`, `queryTasks(tasks, filter)`, `validateTask(task)`.

- [x] **Step 1: Write failing tests** that require a missing `normalpocket-work-core.js`. Cover deterministic id/time injection, trim validation, date validation, immutable edit, revision/history increment, get by id, deterministic ordering, and the exact query filters `id / status / dueFrom / dueTo`.
- [x] **Step 2: Run focused test** and confirm RED before implementation.
- [x] **Step 3: Implement minimal pure module.** The module exports an immutable API through CommonJS and `globalThis.NormalPocketWorkCore`; it must not access DOM, IndexedDB, Vault, STORE, LEDGER, or Calendar globals. `queryTasks` accepts only `id`, `status`, `dueFrom`, and `dueTo` and rejects unsupported filter keys.
- [x] **Step 4: Run focused test**; confirm GREEN.
- [x] **Step 5: Review Task 1** against the spec and forbidden dependencies before continuing.

### Task 2: NormalPocket state adapter and isolated durable readback

**Files:**
- Create: `tests/work-task-adapter.test.cjs`
- Create: `normalpocket-work-adapter.js`
- Create: `tests/helpers/isolated-durable-store.cjs`

**Interfaces:**
- Consumes: `NormalPocketWorkCore` API from Task 1.
- Produces: `ensureWorkState(state)`, `createTaskInState`, `editTaskInState`, `queryTasksInState`.
- Test helper produces a test-only durable boundary; it is not a production storage adapter.

- [x] **Step 1: Write failing adapter tests.** Require the missing adapter, prove it preserves unrelated host keys, initializes `state.work.tasks`, creates/edits through the core, and returns cloned state.
- [x] **Step 2: Write the durable acceptance test** that requires a test-only filesystem store with explicit `namespace / database / key`; commit adapter-returned state, sync to disk, close the store, reopen a new store instance, read back, and deep-compare the exact durable state/task. The helper must hard-reject `ygph-standard-secure`.
- [x] **Step 3: Run focused adapter/durable test** and confirm RED before the durable helper exists.
- [x] **Step 4: Implement minimal adapter** with no DOM or persistence API calls, plus `tests/helpers/isolated-durable-store.cjs` strictly as test infrastructure.
- [x] **Step 5: Run core + adapter + durable tests**; confirm GREEN.
- [x] **Step 6: Review Task 2** for ownership leakage and confirm the proof is commit → sync → close → reopen new instance → readback/deep-compare with no live-data path.

### Task 3: Explicit close transitions and history protection

**Files:**
- Modify: `tests/work-task-core.test.cjs`
- Modify: `normalpocket-work-core.js`
- Modify: `tests/work-task-adapter.test.cjs`
- Modify: `normalpocket-work-adapter.js`

**Interfaces:**
- Adds core: `completeTask(task, context)`, `cancelTask(task, context)`.
- Adds adapter: `completeTaskInState(state, id, context)`, `cancelTaskInState(state, id, context)`.

- [x] **Step 1: Add failing tests** for OPEN → COMPLETED, OPEN → CANCELLED, history/revision increment, edit rejection after close, and repeated close rejection.
- [x] **Step 2: Run focused tests**; confirm RED because close methods do not exist.
- [x] **Step 3: Implement minimal transitions** in core and adapter.
- [x] **Step 4: Run focused tests**; confirm GREEN.
- [x] **Step 5: Review Task 3** for silent-history rewrite or destructive-delete behavior.

### Task 4: Portability and dependency-boundary proof

**Files:**
- Create: `tests/work-task-portability.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes the finished core/adapter contract only.
- Produces evidence that another host-shaped state can use the capability without NormalPocket UI/storage globals.

- [x] **Step 1: Write portability tests** using a second host object such as `{ lighthouse: { session: 'x' }, work: { tasks: [] } }`; prove create/edit/query/complete while preserving the unrelated host structure using only the authorized query contract.
- [x] **Step 2: Add static forbidden-dependency assertions** over core/adapter source for `document`, `indexedDB`, `VAULT_KEY`, `ledger`, `amountSatang`, `installment`, and Intent parser references.
- [x] **Step 3: Run portability test**. If it exposes leakage, treat that as RED and fix the production module rather than weakening the assertion.
- [x] **Step 4: Update `check:syntax`** to include `normalpocket-work-core.js` and `normalpocket-work-adapter.js` so the repository gate owns their syntax.
- [x] **Step 5: Run all WorkTask tests**; confirm GREEN.
- [x] **Step 6: Review Task 4** for true host neutrality rather than renamed NormalPocket coupling.

### Task 5: Repository regression gate and review handoff

**Files:**
- No production behavior changes expected.
- Update the Notion NormalPocket Review Pack with exact commits, RED/GREEN evidence, review outcomes, and non-goals.

**Interfaces:**
- Produces a branch/PR review artifact; does not merge or deploy.

- [x] **Step 1: Run `npm run deploy:gate` through the repository CI** and require GREEN at the exact review HEAD.
- [x] **Step 2: Compare branch against base** and verify changed production files are limited to the new pure modules plus `package.json`; test-only durable helper is under `tests/helpers/`; no `app.js`, Calendar finance flow, Vault, service worker, or release manifest behavior changes.
- [x] **Step 3: Open/refresh PR** with the source lock, acceptance criteria, test evidence, and explicit non-goals.
- [ ] **Step 4: Independent final requirement review.** Critical/important issues return to the owning task; only an independent ACCEPT advances to READY FOR OWNER.
- [ ] **Step 5: After independent ACCEPT only, update Notion** to `IMPLEMENTATION COMPLETE · REVIEW ACCEPTED · WAIT OWNER`; do not merge or deploy automatically.

## Return-history truth

- RETURN #1 identified query-contract drift and an insufficient memory-only durability proof; both were repaired with RED → GREEN and full-gate evidence.
- RETURN #2 identified documentation truth drift only: the code/tests were already aligned, while this spec/plan still described the superseded query and memory contracts. RETURN #2 repair updates documentation only unless fresh verification finds another mismatch.
