# GO Hub Factory Controller Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind real GO Hub Factory actions to one server-authoritative CodeTask through immutable Reality Receipts, exact identity validation, durable revisioned state, and reconciliation before mutation.

**Architecture:** Add a thin server-side Factory Controller around the existing GitHub lifecycle instead of replacing it. Store one compact task authority per task ID in a SQLite-backed Cloudflare Durable Object, normalize every operational result into a Reality Receipt, derive CodeTask transitions only from those receipts, and expose one strict `go_hub_factory_action` surface to MCP/browser operators while preserving low-level tools as infrastructure.

**Tech Stack:** Cloudflare Worker ES modules, Cloudflare Durable Objects with SQLite storage, existing GitHub REST lifecycle, Node.js 22 `node:test`, existing CodeTask/Evidence modules, MCP registry, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-15-go-hub-factory-controller-bridge-design.md`

## Global Constraints

- GitHub remains authoritative for repository, branch, commit, PR, CI, and workflow reality.
- CodeTask is the compact Factory task truth; no second task model may be introduced.
- Browser `localStorage` becomes cache/projection only and cannot override server/GitHub truth.
- New Durable Object storage must be SQLite-backed.
- Factory Controller runs server-side and is shared by browser and MCP callers.
- Existing low-level lifecycle tools remain available but cannot silently advance Factory truth.
- No generic GitHub proxy, widened repository permissions, or secrets in receipts/task state.
- TDD is required for every behavior change: failing test first, observe RED, minimal implementation, observe GREEN.
- Every mutating controller action reconciles server task state against external GitHub truth first.
- External success followed by failed task persistence returns `RECONCILIATION_REQUIRED`, never success.
- Exact repository/branch/SHA/run/PR identity is mandatory wherever applicable.

---

## File Structure

### New files

- `go-hub-factory-state-core.mjs` — runtime-neutral revisioned task-state port, secret rejection, receipt/audit retention. Importable by Node tests.
- `go-hub-factory-state.mjs` — Cloudflare-only Durable Object adapter that imports `DurableObject` from `cloudflare:workers` and delegates storage semantics to the core port.
- `go-hub-reality-receipt.mjs` — immutable receipt normalization, secret rejection, identity helpers, deterministic diff fingerprinting.
- `go-hub-factory-controller.mjs` — load/reconcile task, invoke injected lifecycle, create receipt, derive CodeTask transition, save revision, return next action.
- `tests/go-hub-factory-state.test.cjs` — tests the runtime-neutral state core; never imports `cloudflare:workers`.
- `tests/go-hub-reality-receipt.test.cjs` — receipt immutability, secret rejection, identity, fingerprint tests.
- `tests/go-hub-factory-controller.test.cjs` — action→receipt→task transitions and fail-closed behavior.
- `tests/go-hub-factory-controller.integration.test.cjs` — one task crossing inspect→branch→write→compare→PR→CI.

### Modified files

- `go-hub-worker.mjs` — re-export the Durable Object class, compose lifecycle + task stub + controller, expose high-level Factory action.
- `go-hub-mcp-registry.mjs` — add strict `go_hub_factory_action` tool.
- `go-hub-github-workspace.js` — add same-origin browser `factoryAction()` adapter while preserving raw methods.
- `go-hub-code-module.js` — distinguish raw GitHub lifecycle readiness from controller-backed Factory readiness.
- `go-hub-shell.js` — server task projection becomes authoritative; local task becomes cache only.
- `wrangler.go-hub.jsonc` — bind `GO_HUB_FACTORY_STATE` and declaratively export `GoHubFactoryState` with SQLite storage.
- `package.json` — syntax-check all new modules.
- `tests/go-hub-lifecycle-service.test.cjs`, `tests/go-hub-mcp-registry.test.cjs`, `tests/go-hub-mcp-publication.test.cjs`, `tests/go-hub-github-workspace.test.cjs`, `tests/go-hub-code-module.test.cjs`, `tests/go-hub-shell.test.cjs` — contract updates.
- `RELEASE_MANIFEST.json`, `.assetsignore`, `go-hub-sw.js`, `tests/go-hub-active-publication.test.cjs` — update only when browser-active runtime files change; server-only `.mjs` files stay outside the static shell.

---

### Task 1: Durable Task Authority

**Files:**
- Create: `go-hub-factory-state-core.mjs`
- Create: `go-hub-factory-state.mjs`
- Create: `tests/go-hub-factory-state.test.cjs`
- Modify: `wrangler.go-hub.jsonc`
- Modify: `package.json`
- Modify: `tests/go-hub-mcp-publication.test.cjs`

**Interfaces:**
- `createFactoryStatePort({ storage })`
  - `load()` -> `{ revision, task, receipts, audit } | null`
  - `save({ expectedRevision, task, receipt, auditEvent })` -> `{ revision, task, receipt }`
- `GoHubFactoryState` public RPC methods delegate to the core port:
  - `load()`
  - `save(input)`
- Per-task storage keys: `revision`, `task`, `receipts`, `audit`.
- Retention: latest 50 compact receipts and latest 200 audit events.

- [ ] **Step 1: Write the failing core-state tests**

Create `tests/go-hub-factory-state.test.cjs`:

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const coreUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-factory-state-core.mjs")).href;

function storageFixture() {
  const values = new Map();
  return {
    async get(key) { return structuredClone(values.get(key)); },
    async put(entries) {
      for (const [key, value] of Object.entries(entries)) values.set(key, structuredClone(value));
    },
  };
}

test("Factory state serializes one revisioned task authority", async () => {
  const { createFactoryStatePort } = await import(coreUrl + "?state=" + Date.now());
  const port = createFactoryStatePort({ storage: storageFixture() });
  assert.equal(await port.load(), null);

  const first = await port.save({
    expectedRevision: 0,
    task: { id: "task-1", state: "INSPECTING" },
    receipt: { id: "r-1", action: "inspect", status: "success" },
    auditEvent: { event: "FACTORY_ACTION", receiptId: "r-1" },
  });
  assert.equal(first.revision, 1);
  assert.equal((await port.load()).task.id, "task-1");

  await assert.rejects(port.save({
    expectedRevision: 0,
    task: { id: "task-1", state: "BRANCH_READY" },
    receipt: { id: "r-2" },
    auditEvent: { event: "FACTORY_ACTION" },
  }), /STALE_TASK_REVISION/);
});

test("Factory state rejects secret-bearing snapshots", async () => {
  const { createFactoryStatePort } = await import(coreUrl + "?secret=" + Date.now());
  const port = createFactoryStatePort({ storage: storageFixture() });
  await assert.rejects(port.save({
    expectedRevision: 0,
    task: { id: "task-1", token: "nope" },
    receipt: { id: "r-1" },
    auditEvent: { event: "FACTORY_ACTION" },
  }), /SECRET_FIELD_REJECTED/);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/go-hub-factory-state.test.cjs`

Expected: FAIL because `go-hub-factory-state-core.mjs` does not exist.

- [ ] **Step 3: Implement the runtime-neutral core**

Create `go-hub-factory-state-core.mjs`:

```js
const SECRET_KEY = /(authorization|token|secret|passcode|master.?key)/i;

function rejectSecrets(value, path = "root") {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) throw new Error(`SECRET_FIELD_REJECTED:${path}.${key}`);
    rejectSecrets(nested, `${path}.${key}`);
  }
}

export function createFactoryStatePort({ storage } = {}) {
  if (!storage || typeof storage.get !== "function" || typeof storage.put !== "function") {
    throw new Error("Durable storage port is required");
  }
  return Object.freeze({
    async load() {
      const revision = await storage.get("revision");
      if (revision == null) return null;
      return {
        revision,
        task: (await storage.get("task")) ?? null,
        receipts: (await storage.get("receipts")) ?? [],
        audit: (await storage.get("audit")) ?? [],
      };
    },
    async save({ expectedRevision, task, receipt, auditEvent } = {}) {
      const current = Number((await storage.get("revision")) ?? 0);
      if (Number(expectedRevision) !== current) throw new Error("STALE_TASK_REVISION");
      rejectSecrets(task); rejectSecrets(receipt); rejectSecrets(auditEvent);
      const receipts = [...((await storage.get("receipts")) ?? []), structuredClone(receipt)].slice(-50);
      const audit = [...((await storage.get("audit")) ?? []), structuredClone(auditEvent)].slice(-200);
      const revision = current + 1;
      await storage.put({ revision, task: structuredClone(task), receipts, audit });
      return { revision, task: structuredClone(task), receipt: structuredClone(receipt) };
    },
  });
}
```

- [ ] **Step 4: Add the Cloudflare adapter without importing it in Node behavior tests**

Create `go-hub-factory-state.mjs`:

```js
import { DurableObject } from "cloudflare:workers";
import { createFactoryStatePort } from "./go-hub-factory-state-core.mjs";

export class GoHubFactoryState extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.port = createFactoryStatePort({ storage: ctx.storage });
  }
  async load() { return this.port.load(); }
  async save(input) { return this.port.save(input); }
}
```

Node tests import only `go-hub-factory-state-core.mjs`; `go-hub-factory-state.mjs` is covered by syntax/config/deployment contracts.

- [ ] **Step 5: Configure the new SQLite-backed Durable Object**

Modify `wrangler.go-hub.jsonc`:

```jsonc
"durable_objects": {
  "bindings": [
    { "name": "GO_HUB_FACTORY_STATE", "class_name": "GoHubFactoryState" }
  ]
},
"exports": {
  "GoHubFactoryState": { "type": "durable-object", "storage": "sqlite" }
}
```

Use `exports`, not a new `migrations` history: current Cloudflare configuration supports declarative Durable Object class lifecycle and requires new namespaces to use SQLite storage.

- [ ] **Step 6: Update syntax/publication contracts**

Add both new modules to `check:syntax`:

```text
node --check go-hub-factory-state-core.mjs
node --check go-hub-factory-state.mjs
```

Extend `tests/go-hub-mcp-publication.test.cjs`:

```js
assert.equal(wrangler.durable_objects.bindings[0].name, "GO_HUB_FACTORY_STATE");
assert.equal(wrangler.durable_objects.bindings[0].class_name, "GoHubFactoryState");
assert.equal(wrangler.exports.GoHubFactoryState.type, "durable-object");
assert.equal(wrangler.exports.GoHubFactoryState.storage, "sqlite");
assert.match(packageJson.scripts["check:syntax"], /go-hub-factory-state-core\.mjs/);
assert.match(packageJson.scripts["check:syntax"], /go-hub-factory-state\.mjs/);
```

- [ ] **Step 7: Run GREEN verification**

Run:

```bash
node --test tests/go-hub-factory-state.test.cjs tests/go-hub-mcp-publication.test.cjs
npm run check:syntax
```

Expected: all pass.

- [ ] **Step 8: Commit**

Commit message: `feat: add durable Factory task authority`

---

### Task 2: Reality Receipt Core + Inspect/Branch Controller

**Files:**
- Create: `go-hub-reality-receipt.mjs`
- Create: `go-hub-factory-controller.mjs`
- Create: `tests/go-hub-reality-receipt.test.cjs`
- Create: `tests/go-hub-factory-controller.test.cjs`

**Interfaces:**
- `createRealityReceipt({ id, action, status, repository, observedAt, source, identity, result, evidence })`
- `fingerprintCompare({ base, head, status, aheadBy, behindBy, files }) -> string`
- `createFactoryController({ lifecycle, state, now, createId })`
- `execute({ taskId, action, input, expectedRevision }) -> { status, receipt, task, revision, nextAction, reconciliation? }`
- Initial actions: `inspect`, `create_branch`.

- [ ] **Step 1: Write RED receipt tests**

Require deep immutability, explicit source/status, secret rejection, and deterministic fingerprinting.

```js
const receipt = createRealityReceipt({
  id: "r-1", action: "inspect", status: "success",
  repository, observedAt: "2026-09-15T00:00:00.000Z", source: "github",
  identity: { baseSha: "base", headSha: "head" }, result: { branch: "main" }, evidence: { treeCount: 3 },
});
assert.equal(Object.isFrozen(receipt), true);
assert.throws(() => createRealityReceipt({
  id: "r-2", action: "inspect", status: "success", repository,
  observedAt: "now", source: "github", evidence: { authorization: "Bearer x" },
}), /SECRET_FIELD_REJECTED/);
```

- [ ] **Step 2: Write RED controller tests for inspect and branch**

First inspect requires `{ taskId, input: { repository, intent, branch? } }`, creates the CodeTask from real inspect output, and persists revision 1. `create_branch` requires the task base SHA and returns `BRANCH_READY` only when returned branch/head identity matches.

```js
assert.equal(inspected.task.baseSha, "base-1");
assert.equal(inspected.revision, 1);
assert.equal(branched.task.state, "BRANCH_READY");
assert.equal(branched.task.workBranch, "feature-a");
assert.equal(branched.task.headSha, "base-1");
```

- [ ] **Step 3: Run RED**

Run:

```bash
node --test tests/go-hub-reality-receipt.test.cjs tests/go-hub-factory-controller.test.cjs
```

- [ ] **Step 4: Implement `go-hub-reality-receipt.mjs`**

Rules:

- require non-empty `id`, `action`, `repository`, `observedAt`;
- status enum = `success|failure|blocked`;
- source enum = `github|go-hub-gateway`;
- recursively reject secret-bearing keys;
- clone + deep-freeze receipt;
- `fingerprintCompare()` stable-sorts files by path and hashes/stably serializes base/head/status/aheadBy/behindBy/path/status/additions/deletions/patch so caller cannot inject a fingerprint.

- [ ] **Step 5: Implement inspect/create-branch controller only**

Controller sequence:

1. `state.load()`;
2. reject stale `expectedRevision` before any external mutation;
3. first `inspect` requires `intent` and creates CodeTask;
4. call existing `lifecycle.inspect()` and derive base/head from returned payload only;
5. create receipt and audit event;
6. save through state port;
7. `create_branch` requires `fromSha === task.baseSha`, calls existing lifecycle, validates returned branch/head, transitions CodeTask to `BRANCH_READY` from receipt data;
8. non-OK upstream result creates failure receipt and never records a success transition.

- [ ] **Step 6: Add mismatch regression**

If branch result identity disagrees with requested/current task identity, expect `IDENTITY_MISMATCH` and no `BRANCH_READY` persistence.

- [ ] **Step 7: Run GREEN**

Run the two targeted test files.

- [ ] **Step 8: Commit**

Commit message: `feat: bind inspect and branch to Factory receipts`

---

### Task 3: Mutation + Compare + Split-Brain Recovery

**Files:**
- Modify: `go-hub-factory-controller.mjs`
- Modify: `go-hub-reality-receipt.mjs`
- Modify: `tests/go-hub-factory-controller.test.cjs`

**Interfaces:**
- Add actions `write`, `delete`, `compare`.
- Mutation receipt head is the returned GitHub commit SHA.
- Compare receipt contains exact base/head and controller-generated `diffFingerprint`.

- [ ] **Step 1: Write RED mutation test**

Successful write returns `{ commit: "commit-2", sha: "blob-2" }`; assert:

```js
assert.equal(result.receipt.identity.headSha, "commit-2");
assert.equal(result.task.headSha, "commit-2");
assert.equal(result.task.diffFingerprint, null);
assert.equal(result.task.ci, null);
```

- [ ] **Step 2: Write RED compare test**

Caller supplies no fingerprint. After compare:

```js
assert.equal(result.task.state, "DIFF_REVIEWED");
assert.equal(result.task.diffFingerprint, result.receipt.evidence.diffFingerprint);
```

- [ ] **Step 3: Write RED persistence-failure test**

If external write succeeds but `state.save()` fails, return exactly a `RECONCILIATION_REQUIRED` result retaining the successful write receipt and `nextAction: "reconcile"`; never relabel external success as failure.

- [ ] **Step 4: Run RED**

Run controller tests.

- [ ] **Step 5: Implement write/delete/compare**

Rules:

- use `task.workBranch`; caller cannot select another mutation branch;
- missing work branch -> `BLOCKED`;
- returned commit becomes new task head;
- existing CodeTask head-change invalidation clears stale diff/PR/CI;
- compare calls the existing lifecycle operation and derives fingerprint from returned compare evidence;
- only receipt-derived compare evidence may cause `DIFF_REVIEWED`;
- save failure after side effect -> `RECONCILIATION_REQUIRED`.

- [ ] **Step 6: Run GREEN + full gate**

```bash
node --test tests/go-hub-factory-controller.test.cjs tests/go-hub-reality-receipt.test.cjs
npm run deploy:gate
```

- [ ] **Step 7: Commit**

Commit message: `feat: bind Factory mutation and diff receipts`

---

### Task 4: PR + CI + Failure Evidence

**Files:**
- Modify: `go-hub-factory-controller.mjs`
- Modify: `tests/go-hub-factory-controller.test.cjs`
- Create: `tests/go-hub-factory-controller.integration.test.cjs`

**Interfaces:**
- Add `open_pr`, `check_ci`, `diagnose_failure`.
- PR receipt must match active head.
- CI classification: `CI_RUNNING|CI_GREEN|CI_FAILED`; zero signals never means green.
- Failure diagnosis is allowed only for a failed run already bound to current task CI truth.

- [ ] **Step 1: Write RED PR mismatch test**

Live PR head `other` against task head `head-current` must fail `IDENTITY_MISMATCH` and not transition to `PR_OPEN`.

- [ ] **Step 2: Write RED CI classification tests**

Cover in-progress, all-success, any-failure, and zero-signal cases. Controller always calls `getCI({ repository, sha: task.headSha })`.

- [ ] **Step 3: Write RED failure-evidence binding test**

Current CI failed run `77` permits `diagnose_failure({runId:77})`; run `88` is rejected. Attach only normalized failed job/step/excerpt evidence from `getFailureEvidence`.

- [ ] **Step 4: Run RED**

Run controller tests.

- [ ] **Step 5: Implement PR/CI/diagnosis through existing lifecycle methods**

Do not add GitHub REST fetches to the controller.

- [ ] **Step 6: Add full in-memory integration test**

Exercise one CodeTask:

```text
inspect(main/base-1)
→ create_branch(feature-a/base-1)
→ write(commit-2)
→ compare(base-1...commit-2)
→ open_pr(PR 41/head commit-2)
→ check_ci(head commit-2/success)
```

Final assertions:

```js
assert.equal(result.task.state, "CI_GREEN");
assert.equal(result.task.repository, repository);
assert.equal(result.task.workBranch, "feature-a");
assert.equal(result.task.headSha, "commit-2");
assert.equal(result.task.pullRequest.number, 41);
assert.equal(result.task.ci.headSha, "commit-2");
assert.equal(result.revision, 6);
```

- [ ] **Step 7: Run GREEN + full gate**

```bash
node --test tests/go-hub-factory-controller.test.cjs tests/go-hub-factory-controller.integration.test.cjs
npm run deploy:gate
```

- [ ] **Step 8: Commit**

Commit message: `feat: bind PR CI and failure evidence to Factory task`

---

### Task 5: Reconciliation Before Mutation

**Files:**
- Modify: `go-hub-factory-controller.mjs`
- Modify: `tests/go-hub-factory-controller.test.cjs`
- Modify: `tests/go-hub-factory-controller.integration.test.cjs`

**Interfaces:**
- Internal reconciliation enum: `MATCH|ADVANCED_EXTERNALLY|CONFLICT|MISSING`.
- Mutating actions reconcile first and never mutate in the same call after a non-`MATCH` result.

- [ ] **Step 1: Write RED external-head-advance test**

Stored head `head-1`, live work branch head `head-2`. Before write, controller must persist refreshed head/invalidation and return:

```js
{
  status: "STALE_TASK",
  reconciliation: { status: "ADVANCED_EXTERNALLY", observedHeadSha: "head-2" }
}
```

No mutation call occurs.

- [ ] **Step 2: Write RED missing-resource test**

Missing live work branch/PR returns `MISSING`, records blocker/evidence, and performs no mutation.

- [ ] **Step 3: Write RED PR drift test**

Contradictory live branch/PR identity returns `CONFLICT`; explainable live advancement returns `ADVANCED_EXTERNALLY` and invalidates stale PR/CI.

- [ ] **Step 4: Run RED**

Run controller tests.

- [ ] **Step 5: Implement stage-sensitive reconciliation**

Use existing `inspect`, `getPullRequest`, and `getCI` only when relevant to the current stage. Do not refetch every resource on every action.

Rules:

- exact match -> continue;
- branch head drift -> refresh/invalidate/save and require retry with new revision;
- missing resource -> fail closed;
- contradictory identity -> conflict;
- no mutation after non-match reconciliation in the same request.

- [ ] **Step 6: Run GREEN + gate**

```bash
node --test tests/go-hub-factory-controller.test.cjs tests/go-hub-factory-controller.integration.test.cjs
npm run deploy:gate
```

- [ ] **Step 7: Commit**

Commit message: `feat: reconcile Factory task before mutation`

---

### Task 6: Worker + MCP + Browser Wiring

**Files:**
- Modify: `go-hub-worker.mjs`
- Modify: `go-hub-mcp-registry.mjs`
- Modify: `go-hub-github-workspace.js`
- Modify: `go-hub-code-module.js`
- Modify: `go-hub-shell.js`
- Modify: `tests/go-hub-mcp-registry.test.cjs`
- Modify: `tests/go-hub-lifecycle-service.test.cjs`
- Modify: `tests/go-hub-github-workspace.test.cjs`
- Modify: `tests/go-hub-code-module.test.cjs`
- Modify: `tests/go-hub-shell.test.cjs`
- Modify publication/cache files if browser-active assets change.

**Interfaces:**
- Worker: `factoryAction(input)` delegates to `env.GO_HUB_FACTORY_STATE.getByName(taskId)` plus existing GitHub lifecycle.
- MCP: `go_hub_factory_action({ taskId, action, input, expectedRevision? })`.
- Browser: `workspace.factoryAction({ taskId, action, input, expectedRevision })`.
- Implemented action enum: `inspect`, `create_branch`, `write`, `delete`, `compare`, `open_pr`, `check_ci`, `diagnose_failure`.

- [ ] **Step 1: Write RED Worker service tests**

Inject fake `GO_HUB_FACTORY_STATE.getByName(taskId)` stub; prove task-specific state binding and reject unsafe task IDs. Use owner-scoped IDs such as `pureekangraw-ops:factory-bridge-1`.

- [ ] **Step 2: Write RED MCP contract test**

Add `go_hub_factory_action` with required `taskId`, `action`, `input`, optional `expectedRevision`, strict action enum, `additionalProperties:false`, `readOnlyHint:false`, `destructiveHint:false`.

- [ ] **Step 3: Write RED browser adapter test**

`factoryAction()` POSTs same-origin to `/hub/api/github-workspace/factory-action`, sends no Authorization header, and forwards only controller fields.

- [ ] **Step 4: Write RED Code/shell authority tests**

Require:

- controller-backed readiness only when `factoryAction` exists;
- local cache may render immediately but server task must load/reconcile before mutation controls become active;
- browser operator path no longer advances authoritative CodeTask by local `transition()` calls.

- [ ] **Step 5: Run RED**

Run the modified Worker/MCP/workspace/Code/shell tests.

- [ ] **Step 6: Wire Worker service**

In `go-hub-worker.mjs`:

```js
export { GoHubFactoryState } from "./go-hub-factory-state.mjs";
```

Create one raw GitHub lifecycle as today. For Factory action, resolve `env.GO_HUB_FACTORY_STATE.getByName(taskId)`, adapt its RPC `load/save` to controller state port, instantiate controller with the existing lifecycle, and execute the action.

Expose:

- MCP lifecycle method `factoryAction` separately from raw GitHub lifecycle methods;
- same-origin `POST /hub/api/github-workspace/factory-action` for browser Code.

Do not add generic state dump/mutation endpoints.

- [ ] **Step 7: Wire MCP and browser adapter**

Add the strict registry definition and `workspace.factoryAction()`; preserve all raw tools unchanged.

- [ ] **Step 8: Wire shell projection**

Startup sequence:

1. render cached local projection if present;
2. load/reconcile server task before enabling mutation;
3. replace Workbench with server task;
4. after every controller action, update local cache only from controller result.

Keep pure CodeTask functions because the server controller and unit tests still use them.

- [ ] **Step 9: Update publication/cache generation**

Because browser-active `go-hub-shell.js`, `go-hub-code-module.js`, and `go-hub-github-workspace.js` change, bump `go-hub-sw.js` cache generation and keep `RELEASE_MANIFEST.json`, `.assetsignore`, and active-publication tests synchronized. Server-only `.mjs` controller/state modules are syntax/deploy assets, not app-shell cache entries.

- [ ] **Step 10: Run GREEN + full gate**

```bash
node --test \
  tests/go-hub-factory-state.test.cjs \
  tests/go-hub-reality-receipt.test.cjs \
  tests/go-hub-factory-controller.test.cjs \
  tests/go-hub-factory-controller.integration.test.cjs \
  tests/go-hub-mcp-registry.test.cjs \
  tests/go-hub-github-workspace.test.cjs \
  tests/go-hub-code-module.test.cjs \
  tests/go-hub-shell.test.cjs \
  tests/go-hub-mcp-publication.test.cjs
npm run deploy:gate
```

- [ ] **Step 11: Commit**

Commit message: `feat: route Factory operations through one controller`

---

### Task 7: PR, Exact-Head CI, Main Deploy, Production Smoke

**Files:**
- No new production files unless verification reveals a defect.

- [ ] **Step 1: Map all 12 spec success criteria to concrete tests**

Required mapping:

1. one shared server authority -> Task 1 + Task 6;
2. immutable receipt -> Task 2;
3. identity binding -> Tasks 2–5;
4. controller-derived CodeTask transition -> Tasks 2–4;
5. provenance -> receipt assertions Tasks 2–4;
6. stale evidence invalidation -> Tasks 3 + 5;
7. reconciliation-required split brain -> Task 3;
8. resume reconciliation -> Task 5;
9. inspect→CI one-task path -> Task 4 integration;
10. lifecycle reuse -> controller tests assert injected lifecycle methods are called, never direct fetch;
11. raw tools cannot advance Factory truth -> Task 6;
12. exact-head Safety Gate -> PR CI evidence below.

- [ ] **Step 2: Run fresh full gate on final head**

Run: `npm run deploy:gate`; require exit 0.

- [ ] **Step 3: Compare branch vs current `main`**

Confirm no unrelated GO City/Factory-menu changes.

- [ ] **Step 4: Open/update PR**

PR body records root cause, controller/DO/receipt architecture, exact verification, first-Durable-Object deployment risk, explicit non-goals, and rollback note: reverting code/config stops use of the new controller; DO lifecycle deletion is a separate deliberate operation and must not be improvised during rollback.

- [ ] **Step 5: Require exact-head PR Safety Gate GREEN**

No old-head evidence.

- [ ] **Step 6: Guarded merge**

Merge only current mergeable PR head with exact-head CI green.

- [ ] **Step 7: Verify merge SHA on `main`**

Require both `STANDARD Safety Gate` success and `GO Hub Deploy` success.

- [ ] **Step 8: Production read-only smoke**

Use deployed `go_hub_factory_action` with a disposable owner-scoped task ID and `inspect` only. Require:

```text
revision = 1
receipt.action = inspect
receipt.status = success
task.repository = pureekangraw-ops/standard-
task.baseSha = current main SHA
```

Do not create a production branch for smoke testing.

- [ ] **Step 9: Preserve next audit queue**

Do not claim these solved by the bridge:

- canonical QC trust hardening,
- staged/batch commit + preflight test,
- conflict resolution/rebase,
- base-fresh merge guard,
- production verification probe,
- operational rollback,
- backup/restore/migration gate.

---

## Self-Review

### Spec coverage

All server authority, receipt, transition, persistence, reconciliation, MCP/browser, security, and integration requirements map to Tasks 1–7. GO City roles and Factory menu remain outside modified responsibilities.

### Placeholder scan

No `TBD`, `TODO`, generic "handle errors", or unnamed implementation work remains. Deferred capabilities are explicitly non-goals and retained in the next audit queue.

### Runtime-boundary check

Cloudflare-specific `DurableObject` import is isolated in `go-hub-factory-state.mjs`. Node behavior tests import only `go-hub-factory-state-core.mjs`, preventing the test runner from failing on the Cloudflare runtime-only module specifier.

### Type consistency

- Controller input: `taskId`, `action`, `input`, `expectedRevision`.
- Controller result: `status`, `receipt`, `task`, `revision`, `nextAction`, optional `reconciliation`.
- State authority: `revision`, `task`, `receipts`, `audit`.
- Action enum: `inspect`, `create_branch`, `write`, `delete`, `compare`, `open_pr`, `check_ci`, `diagnose_failure`.
- Reconciliation enum: `MATCH`, `ADVANCED_EXTERNALLY`, `CONFLICT`, `MISSING`.
