# GO Hub Factory Controller Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind real GO Hub Factory actions to one server-authoritative CodeTask through immutable Reality Receipts, exact identity validation, durable revisioned state, and reconciliation before mutation.

**Architecture:** Add a thin server-side Factory Controller around the existing GitHub lifecycle instead of replacing it. Store one compact task authority per task ID in a SQLite-backed Cloudflare Durable Object, normalize every operational result into a Reality Receipt, derive CodeTask transitions only from those receipts, and expose one strict `go_hub_factory_action` surface to MCP/browser operators while preserving the low-level tools as infrastructure.

**Tech Stack:** Cloudflare Worker ES modules, Cloudflare Durable Objects with SQLite storage, existing GitHub REST lifecycle, Node.js 22 `node:test`, existing CodeTask/Evidence modules, MCP registry, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-15-go-hub-factory-controller-bridge-design.md`

## Global Constraints

- GitHub remains authoritative for repository, branch, commit, PR, CI, and workflow reality.
- CodeTask is the compact Factory task truth; no second task model may be introduced.
- Browser `localStorage` becomes cache/projection only and cannot override server/GitHub truth.
- New Durable Object storage must be SQLite-backed.
- Factory Controller runs server-side and is shared by browser and MCP callers.
- Existing low-level lifecycle tools remain available but cannot silently advance Factory truth.
- No generic GitHub proxy, no widened repository permissions, and no secrets in receipts/task state.
- TDD is required for every behavior change: failing test first, observe RED, minimal implementation, observe GREEN.
- Every mutable controller action must reconcile server task state against external GitHub truth first.
- A successful external side effect followed by failed task persistence returns `RECONCILIATION_REQUIRED`, never success.
- Exact repository/branch/SHA/run/PR identity is mandatory wherever applicable.

---

## File Structure

### New files

- `go-hub-factory-state.mjs` — Durable Object class and compact task-state RPC surface. Owns revisioned persistence only; does not call GitHub or decide lifecycle transitions.
- `go-hub-reality-receipt.mjs` — immutable receipt normalization, secret-field rejection, identity helpers, and deterministic diff fingerprinting.
- `go-hub-factory-controller.mjs` — controller orchestration: load/reconcile task, invoke injected lifecycle operation, create receipt, derive CodeTask transition, save revision, return next action.
- `tests/go-hub-factory-state.test.cjs` — pure Durable Object state contract through an injected storage/context fixture.
- `tests/go-hub-reality-receipt.test.cjs` — receipt immutability, secret rejection, identity, and fingerprint tests.
- `tests/go-hub-factory-controller.test.cjs` — controller unit tests for action→receipt→task transitions and fail-closed behavior.
- `tests/go-hub-factory-controller.integration.test.cjs` — one task crossing inspect→branch→write→compare→PR→CI with exact identity.

### Modified files

- `go-hub-worker.mjs` — export the Durable Object class, create the Factory Controller service from lifecycle + Durable Object binding, and expose the controller operation to MCP/browser routes.
- `go-hub-mcp-registry.mjs` — add strict `go_hub_factory_action` tool definition and route it to `factoryAction`.
- `go-hub-github-workspace.js` — add browser adapter method for the high-level Factory action endpoint; keep low-level workspace methods unchanged.
- `go-hub-code-module.js` — readiness projection recognizes controller availability; browser Code uses controller-backed task state as authority.
- `go-hub-shell.js` — replace direct local authoritative CodeTask loading with server controller task projection; local storage remains cache only.
- `wrangler.go-hub.jsonc` — bind `GO_HUB_FACTORY_STATE` and declare `GoHubFactoryState` as a SQLite-backed Durable Object using the current declarative `exports` format.
- `package.json` — syntax-check new modules.
- `tests/go-hub-lifecycle-service.test.cjs` — preserve explicit lifecycle inventory while adding the controller service separately, not inside raw GitHub lifecycle.
- `tests/go-hub-mcp-registry.test.cjs` — update exact MCP inventory and verify read/write annotations for `go_hub_factory_action`.
- `tests/go-hub-mcp-publication.test.cjs` — require syntax/publication of new server modules and Durable Object config.
- `tests/go-hub-github-workspace.test.cjs` — prove same-origin controller calls and no browser authorization header.
- `tests/go-hub-code-module.test.cjs` — prove Code capability distinguishes raw lifecycle readiness from controller-backed Factory readiness.
- `tests/go-hub-shell.test.cjs` — prove browser shell does not treat localStorage task state as authoritative after controller wiring.
- `RELEASE_MANIFEST.json`, `.assetsignore`, `go-hub-sw.js`, `tests/go-hub-active-publication.test.cjs` — update only if browser-active runtime files change; server-only `.mjs` modules are not added to the static app shell.

---

### Task 1: Durable Task Authority

**Files:**
- Create: `go-hub-factory-state.mjs`
- Create: `tests/go-hub-factory-state.test.cjs`
- Modify: `wrangler.go-hub.jsonc`
- Modify: `package.json`
- Modify: `tests/go-hub-mcp-publication.test.cjs`

**Interfaces:**
- Produces class `GoHubFactoryState` with public RPC methods:
  - `load()` -> `{ revision, task, receipts, audit } | null`
  - `save({ expectedRevision, task, receipt, auditEvent })` -> `{ revision, task, receipt }`
- Storage keys inside one task object:
  - `revision` integer, default `0`
  - `task` serialized CodeTask snapshot or `null`
  - `receipts` array capped to the latest 50 compact receipts
  - `audit` array capped to the latest 200 compact events

- [ ] **Step 1: Write failing state tests**

Create `tests/go-hub-factory-state.test.cjs` with a small in-memory context fixture and require these contracts:

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const stateUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-factory-state.mjs")).href;

function contextFixture() {
  const values = new Map();
  return {
    storage: {
      async get(key) { return structuredClone(values.get(key)); },
      async put(entries) {
        for (const [key, value] of Object.entries(entries)) values.set(key, structuredClone(value));
      },
    },
  };
}

test("Factory state serializes one revisioned task authority", async () => {
  const { createFactoryStatePort } = await import(stateUrl + "?state=" + Date.now());
  const port = createFactoryStatePort({ ctx: contextFixture() });
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

test("Factory state rejects secret-bearing snapshots and receipts", async () => {
  const { createFactoryStatePort } = await import(stateUrl + "?secret=" + Date.now());
  const port = createFactoryStatePort({ ctx: contextFixture() });
  await assert.rejects(port.save({
    expectedRevision: 0,
    task: { id: "task-1", token: "nope" },
    receipt: { id: "r-1" },
    auditEvent: { event: "FACTORY_ACTION" },
  }), /SECRET_FIELD_REJECTED/);
});
```

- [ ] **Step 2: Run targeted test and verify RED**

Run: `node --test tests/go-hub-factory-state.test.cjs`

Expected: FAIL because `go-hub-factory-state.mjs` does not exist.

- [ ] **Step 3: Implement minimal state port and Durable Object class**

Create `go-hub-factory-state.mjs` with:

```js
import { DurableObject } from "cloudflare:workers";

const SECRET_KEY = /(authorization|token|secret|passcode|master.?key)/i;

function rejectSecrets(value, path = "root") {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) throw new Error(`SECRET_FIELD_REJECTED:${path}.${key}`);
    rejectSecrets(nested, `${path}.${key}`);
  }
}

export function createFactoryStatePort({ ctx } = {}) {
  if (!ctx?.storage) throw new Error("Durable Object storage is required");
  return Object.freeze({
    async load() {
      const revision = await ctx.storage.get("revision");
      if (revision == null) return null;
      return {
        revision,
        task: (await ctx.storage.get("task")) ?? null,
        receipts: (await ctx.storage.get("receipts")) ?? [],
        audit: (await ctx.storage.get("audit")) ?? [],
      };
    },
    async save({ expectedRevision, task, receipt, auditEvent } = {}) {
      const current = Number((await ctx.storage.get("revision")) ?? 0);
      if (Number(expectedRevision) !== current) throw new Error("STALE_TASK_REVISION");
      rejectSecrets(task); rejectSecrets(receipt); rejectSecrets(auditEvent);
      const receipts = [...((await ctx.storage.get("receipts")) ?? []), structuredClone(receipt)].slice(-50);
      const audit = [...((await ctx.storage.get("audit")) ?? []), structuredClone(auditEvent)].slice(-200);
      const revision = current + 1;
      await ctx.storage.put({ revision, task: structuredClone(task), receipts, audit });
      return { revision, task: structuredClone(task), receipt: structuredClone(receipt) };
    },
  });
}

export class GoHubFactoryState extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.port = createFactoryStatePort({ ctx });
  }
  async load() { return this.port.load(); }
  async save(input) { return this.port.save(input); }
}
```

- [ ] **Step 4: Configure SQLite-backed Durable Object using current declarative Wrangler format**

Modify `wrangler.go-hub.jsonc` to include:

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

Do not add a `migrations` array because this Worker has no existing Durable Object migration history and the current Cloudflare configuration model prefers declarative `exports` for new classes.

- [ ] **Step 5: Add syntax/publication contract**

Add `node --check go-hub-factory-state.mjs` to `package.json` `check:syntax` and extend `tests/go-hub-mcp-publication.test.cjs` to assert:

```js
assert.equal(wrangler.durable_objects.bindings[0].name, "GO_HUB_FACTORY_STATE");
assert.equal(wrangler.exports.GoHubFactoryState.storage, "sqlite");
assert.match(packageJson.scripts["check:syntax"], /go-hub-factory-state\.mjs/);
```

- [ ] **Step 6: Run targeted tests and full syntax gate**

Run:

```bash
node --test tests/go-hub-factory-state.test.cjs tests/go-hub-mcp-publication.test.cjs
npm run check:syntax
```

Expected: all pass.

- [ ] **Step 7: Commit Task 1**

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
- `controller.execute({ taskId, action, input, expectedRevision }) -> { status, receipt, task, revision, nextAction, reconciliation? }`
- Initial actions: `inspect`, `create_branch`.

- [ ] **Step 1: Write failing receipt tests**

Require immutable normalized receipts, explicit source, exact identity, and secret rejection:

```js
test("Reality receipt is immutable and rejects secret fields", async () => {
  const { createRealityReceipt } = await import(receiptUrl + "?receipt=" + Date.now());
  const receipt = createRealityReceipt({
    id: "r-1", action: "inspect", status: "success",
    repository: "pureekangraw-ops/standard-", observedAt: "2026-09-15T00:00:00.000Z",
    source: "github", identity: { baseSha: "base", headSha: "head" },
    result: { branch: "feature" }, evidence: { treeCount: 7 },
  });
  assert.equal(Object.isFrozen(receipt), true);
  assert.throws(() => createRealityReceipt({
    id: "r-2", action: "inspect", status: "success", repository: "repo",
    observedAt: "now", source: "github", evidence: { authorization: "Bearer x" },
  }), /SECRET_FIELD_REJECTED/);
});
```

- [ ] **Step 2: Write failing controller tests for first inspect and branch creation**

Use injected fake state/lifecycle. The first inspect must create a CodeTask from `taskId + intent + repository`, persist revision 1, and return next action `edit` only after branch creation:

```js
test("controller binds inspect and branch reality to one task", async () => {
  const state = memoryState();
  const lifecycle = {
    inspect: async () => jsonResponse({ repository, defaultBranch: "main", branch: "main", baseSha: "base-1", headSha: "base-1", tree: [] }),
    createBranch: async () => jsonResponse({ branch: "feature-a", headSha: "base-1" }, 201),
  };
  const controller = createFactoryController({ lifecycle, state, now: () => "2026-09-15T00:00:00.000Z", createId: () => "receipt-1" });

  const inspected = await controller.execute({
    taskId: "task-1", action: "inspect", expectedRevision: 0,
    input: { repository, intent: "Factory bridge", branch: "main" },
  });
  assert.equal(inspected.task.repository, repository);
  assert.equal(inspected.task.baseSha, "base-1");
  assert.equal(inspected.revision, 1);

  const branched = await controller.execute({
    taskId: "task-1", action: "create_branch", expectedRevision: 1,
    input: { name: "feature-a", fromSha: "base-1" },
  });
  assert.equal(branched.task.state, "BRANCH_READY");
  assert.equal(branched.task.workBranch, "feature-a");
  assert.equal(branched.task.headSha, "base-1");
});
```

- [ ] **Step 3: Run targeted tests and verify RED**

Run:

```bash
node --test tests/go-hub-reality-receipt.test.cjs tests/go-hub-factory-controller.test.cjs
```

Expected: FAIL because receipt/controller modules do not exist.

- [ ] **Step 4: Implement receipt helpers**

`go-hub-reality-receipt.mjs` must:

- reject secret-bearing key names recursively,
- deep-clone and deep-freeze output,
- require `id/action/status/repository/observedAt/source`,
- accept only `success|failure|blocked`,
- accept only `github|go-hub-gateway` sources,
- export deterministic `fingerprintCompare()` using stable sorted JSON of base/head/status/aheadBy/behindBy/files(path,status,additions,deletions,patch).

- [ ] **Step 5: Implement controller inspect/create-branch only**

`go-hub-factory-controller.mjs` must import `createCodeTask` from `go-hub-code-task.js` and `createRealityReceipt` from the receipt module. It must:

1. load current state;
2. reject mismatched `expectedRevision` before external mutation;
3. on first `inspect`, require `input.intent` and create a CodeTask;
4. call `lifecycle.inspect()` and derive base/work/head context only from returned payload;
5. persist a receipt and audit event;
6. on `create_branch`, require current task base SHA to equal `fromSha` and call `lifecycle.createBranch()`;
7. transition to `BRANCH_READY` from the receipt result;
8. return `ACTION_FAILED` without success transition when upstream response is not OK.

Do not implement write/PR/CI yet.

- [ ] **Step 6: Prove identity mismatch fails closed**

Add test where `createBranch()` returns a head different from requested `fromSha` unexpectedly; controller must return/throw `IDENTITY_MISMATCH` and must not persist `BRANCH_READY`.

- [ ] **Step 7: Run targeted tests GREEN**

Run the two test files from Step 3. Expected: pass.

- [ ] **Step 8: Commit Task 2**

Commit message: `feat: bind inspect and branch to Factory receipts`

---

### Task 3: Mutation + Compare + Reconciliation-Required Failure

**Files:**
- Modify: `go-hub-factory-controller.mjs`
- Modify: `go-hub-reality-receipt.mjs`
- Modify: `tests/go-hub-factory-controller.test.cjs`

**Interfaces:**
- Add actions: `write`, `delete`, `compare`.
- Successful mutation receipt identity includes `workBranch`, new `headSha` equal to returned commit SHA, optional file blob SHA in result.
- Compare receipt includes requested base/head and deterministic `diffFingerprint`.

- [ ] **Step 1: Write failing mutation tests**

Test that controller calls existing lifecycle methods, never default branch mutation, and treats returned commit as the new CodeTask head:

```js
test("write receipt advances task head from the actual commit", async () => {
  const lifecycle = {
    putFile: async () => jsonResponse({ ok: true, commit: "commit-2", sha: "blob-2" }),
  };
  const result = await controller.execute({
    taskId: "task-1", action: "write", expectedRevision: 2,
    input: { path: "src/app.js", content: "next", expectedSha: "blob-1" },
  });
  assert.equal(result.receipt.identity.headSha, "commit-2");
  assert.equal(result.task.headSha, "commit-2");
  assert.equal(result.task.diffFingerprint, null);
  assert.equal(result.task.ci, null);
});
```

- [ ] **Step 2: Write failing compare test**

Require `DIFF_REVIEWED` to be derived from compare output and fingerprinted by the controller; caller cannot provide fingerprint:

```js
assert.equal(result.task.state, "DIFF_REVIEWED");
assert.equal(result.task.diffFingerprint, result.receipt.evidence.diffFingerprint);
```

- [ ] **Step 3: Write failing split-brain test**

Inject state whose `save()` throws after lifecycle mutation succeeds. Controller must return:

```js
{
  status: "RECONCILIATION_REQUIRED",
  receipt: { action: "write", status: "success", identity: { headSha: "commit-2" } },
  task: null,
  revision: 2,
  nextAction: "reconcile"
}
```

and must not relabel the external action as failed.

- [ ] **Step 4: Run tests RED**

Run: `node --test tests/go-hub-factory-controller.test.cjs`

- [ ] **Step 5: Implement write/delete/compare minimally**

Rules:

- use active `task.workBranch`; caller does not choose another branch;
- reject missing work branch as `BLOCKED`;
- mutation `commit` becomes the new task head;
- update CodeTask through its existing stale-head invalidation behavior;
- compare uses `task.baseBranch` and `task.workBranch`/current head identities, calls existing compare operation, computes fingerprint in receipt helper, and only then transitions `DIFF_REVIEWED`;
- persistence failure returns `RECONCILIATION_REQUIRED` with receipt.

- [ ] **Step 6: Run tests GREEN and full deploy gate**

Run:

```bash
node --test tests/go-hub-factory-controller.test.cjs tests/go-hub-reality-receipt.test.cjs
npm run deploy:gate
```

Expected: pass.

- [ ] **Step 7: Commit Task 3**

Commit message: `feat: bind Factory mutation and diff receipts`

---

### Task 4: PR + CI + Failure Evidence Binding

**Files:**
- Modify: `go-hub-factory-controller.mjs`
- Modify: `tests/go-hub-factory-controller.test.cjs`
- Create/Modify: `tests/go-hub-factory-controller.integration.test.cjs`

**Interfaces:**
- Add actions: `open_pr`, `check_ci`, `diagnose_failure`.
- `open_pr` requires returned PR head to equal active task head.
- `check_ci` maps current-head signals to `CI_RUNNING|CI_GREEN|CI_FAILED`.
- `diagnose_failure` requires a failed run ID already present in current CI truth and attaches concise failure evidence to the same task/run identity.

- [ ] **Step 1: Write failing PR identity test**

```js
await assert.rejects(controller.execute({
  taskId: "task-1", action: "open_pr", expectedRevision: 4,
  input: { title: "Factory bridge", body: "evidence" },
}), /IDENTITY_MISMATCH/);
```

Fixture returns PR `headSha: "other"` while task head is `head-current`.

- [ ] **Step 2: Write failing CI classification tests**

Cover:

- any applicable signal in progress -> `CI_RUNNING`,
- all applicable signals completed/success with at least one signal -> `CI_GREEN`,
- any completed failure -> `CI_FAILED`,
- zero signals -> remain/check CI, never green.

The controller must call `getCI({ repository, sha: task.headSha })`; caller does not supply a different SHA.

- [ ] **Step 3: Write failing diagnosis binding test**

Given current CI contains failed run `77`, `diagnose_failure` may call `getFailureEvidence({repository,runId:77})`; run `88` must be rejected as `IDENTITY_MISMATCH`.

Evidence appended to the receipt must contain only failed job/step/excerpt data already normalized by the deployed failure-evidence capability.

- [ ] **Step 4: Run RED**

Run: `node --test tests/go-hub-factory-controller.test.cjs`

- [ ] **Step 5: Implement PR/CI/diagnosis actions**

Use existing lifecycle methods only. Do not duplicate GitHub REST calls in the controller.

- [ ] **Step 6: Add integration path through one task**

`tests/go-hub-factory-controller.integration.test.cjs` should use a fake lifecycle sequence and real CodeTask/controller modules to exercise:

```text
inspect(main/base-1)
→ create_branch(feature-a/base-1)
→ write(commit-2)
→ compare(base-1...commit-2)
→ open_pr(PR 41, head commit-2)
→ check_ci(head commit-2, success)
```

Assertions:

```js
assert.equal(result.task.state, "CI_GREEN");
assert.equal(result.task.repository, repository);
assert.equal(result.task.workBranch, "feature-a");
assert.equal(result.task.headSha, "commit-2");
assert.equal(result.task.pullRequest.number, 41);
assert.equal(result.task.ci.headSha, "commit-2");
assert.equal(result.revision, 6);
```

- [ ] **Step 7: Run targeted tests + full gate GREEN**

Run:

```bash
node --test tests/go-hub-factory-controller.test.cjs tests/go-hub-factory-controller.integration.test.cjs
npm run deploy:gate
```

- [ ] **Step 8: Commit Task 4**

Commit message: `feat: bind PR CI and failure evidence to Factory task`

---

### Task 5: Reconciliation Before Mutation

**Files:**
- Modify: `go-hub-factory-controller.mjs`
- Modify: `tests/go-hub-factory-controller.test.cjs`
- Modify: `tests/go-hub-factory-controller.integration.test.cjs`

**Interfaces:**
- Add internal `reconcile(task)` result with exact enum:
  - `MATCH`
  - `ADVANCED_EXTERNALLY`
  - `CONFLICT`
  - `MISSING`
- All mutating actions (`create_branch`, `write`, `delete`, later merge-related actions) call reconciliation before the side effect.

- [ ] **Step 1: Write failing branch advancement test**

Stored task head `head-1`; lifecycle inspect of work branch returns `head-2`. Before write, controller must not write against `head-1`. It must update task head to `head-2`, invalidate diff/PR/CI, persist reconciliation evidence, and return:

```js
{ status: "STALE_TASK", reconciliation: { status: "ADVANCED_EXTERNALLY", observedHeadSha: "head-2" } }
```

without executing mutation in the same call.

- [ ] **Step 2: Write failing missing-branch test**

If GitHub reports branch missing, return `MISSING`, set blocker with exact resource identity, and do not call mutation.

- [ ] **Step 3: Write failing PR drift test**

Stored PR 41/head-2; live PR returns different head/base. Reconciliation must invalidate stale PR/CI and return `CONFLICT` or `ADVANCED_EXTERNALLY` according to whether the head is explainable by the live work branch.

- [ ] **Step 4: Run RED**

Run controller tests.

- [ ] **Step 5: Implement reconciliation helpers using existing lifecycle reads**

Use `inspect`, `getPullRequest`, and `getCI` only as required by current task stage. Do not refresh every external resource on every action.

Rules:

- branch head drift -> `ADVANCED_EXTERNALLY`, persist refreshed head, caller retries action with new revision;
- missing current work branch/PR -> `MISSING`, fail closed;
- contradictory branch/PR identity -> `CONFLICT`, fail closed;
- exact match -> continue action;
- never mutate after a non-`MATCH` reconciliation outcome in the same controller call.

- [ ] **Step 6: Run targeted tests + gate GREEN**

Run:

```bash
node --test tests/go-hub-factory-controller.test.cjs tests/go-hub-factory-controller.integration.test.cjs
npm run deploy:gate
```

- [ ] **Step 7: Commit Task 5**

Commit message: `feat: reconcile Factory task before mutation`

---

### Task 6: Worker + MCP + Browser Operator Wiring

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
- Modify publication files only if browser-active file contents require cache generation change.

**Interfaces:**
- Worker service: `factoryAction(input)` delegates to Durable Object named by owner-scoped `taskId`.
- MCP tool:

```text
go_hub_factory_action({ taskId, action, input, expectedRevision? })
```

- Browser adapter:

```js
workspace.factoryAction({ taskId, action, input, expectedRevision })
```

- [ ] **Step 1: Write failing Worker/controller-service tests**

Inject fake `env.GO_HUB_FACTORY_STATE.getByName(taskId)` returning a stub with `load/save`, then assert Worker factory service uses that task-specific stub and existing GitHub lifecycle.

Reject task IDs outside a strict owner-scoped format such as `pureekangraw-ops:<non-empty-safe-id>`.

- [ ] **Step 2: Write failing MCP registry test**

Add expected tool `go_hub_factory_action` after low-level lifecycle tools and before/after MIMIR according to the final fixed inventory. Assert:

```js
assert.equal(tool.annotations.readOnlyHint, false);
assert.equal(tool.annotations.destructiveHint, false);
```

The input schema must require `taskId`, `action`, and `input`; `action` uses an enum of currently implemented actions:

```text
inspect, create_branch, write, delete, compare, open_pr, check_ci, diagnose_failure
```

`additionalProperties: false` remains enforced.

- [ ] **Step 3: Write failing browser adapter test**

`factoryAction()` POSTs to `/hub/api/github-workspace/factory-action`, includes no Authorization header, and forwards only task/action/input/expectedRevision.

- [ ] **Step 4: Write failing Code/shell authority tests**

Require that:

- Code capability reports controller-backed Factory readiness only when `factoryAction` exists;
- browser startup may render cached task projection but must fetch/load server task before enabling mutation;
- local task cache cannot call `transition()` as the authoritative operator path after controller cutover.

- [ ] **Step 5: Run RED**

Run the five modified contract test files.

- [ ] **Step 6: Wire Worker service and routes**

In `go-hub-worker.mjs`:

- export `GoHubFactoryState` from `go-hub-factory-state.mjs`;
- create one raw GitHub lifecycle as today;
- create a task-state adapter using `env.GO_HUB_FACTORY_STATE.getByName(taskId)`;
- create/invoke `createFactoryController()` per request with that state adapter;
- expose `factoryAction` to MCP lifecycle object separately from raw GitHub lifecycle methods;
- add same-origin `POST /hub/api/github-workspace/factory-action` for browser Code.

Do not add arbitrary internal state read/write routes.

- [ ] **Step 7: Wire MCP and browser adapter**

Add registry definition and `workspace.factoryAction()` method. Preserve all existing low-level methods unchanged.

- [ ] **Step 8: Wire Code/shell projection**

On shell startup:

1. keep current local cache only for immediate display;
2. call controller `inspect`/load path appropriate for active task before enabling mutation;
3. replace Workbench projection with returned server-authoritative task;
4. after every Factory action, update local cache from controller result rather than locally transitioning CodeTask.

Do not remove CodeTask pure transition methods; tests and server controller still use them.

- [ ] **Step 9: Update syntax/publication/cache generation if needed**

Add new `.mjs` modules to syntax checks. If `go-hub-shell.js`, `go-hub-code-module.js`, or `go-hub-github-workspace.js` changes are active static assets, update the `go-hub-sw.js` cache generation and publication tests so deployed clients do not retain a stale operator surface.

- [ ] **Step 10: Run targeted tests + full gate GREEN**

Run:

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

Expected: all pass, no syntax failures, no publication parity failures.

- [ ] **Step 11: Commit Task 6**

Commit message: `feat: route Factory operations through one controller`

---

### Task 7: Integration PR, Exact-Head CI, Deploy Verification

**Files:**
- No new production files unless verification reveals a defect.

**Interfaces:**
- Final branch contains spec + plan + Tasks 1–6.

- [ ] **Step 1: Re-read spec and map every success criterion to a test**

Required mapping:

1. shared server authority -> Task 1 + Task 6 tests;
2. immutable receipt -> Task 2 receipt tests;
3. identity binding -> Tasks 2–5 tests;
4. controller-derived CodeTask transition -> Tasks 2–4 tests;
5. trusted provenance -> Tasks 2–4 receipt assertions;
6. stale evidence invalidation -> Tasks 3 + 5 tests;
7. reconciliation-required split brain -> Task 3 test;
8. resume reconciliation -> Task 5 tests;
9. full inspect→CI path -> Task 4 integration test;
10. lifecycle reuse -> test mocks assert controller calls injected lifecycle methods rather than fetch;
11. raw tools cannot advance Factory truth -> Task 6 tests;
12. exact-head Safety Gate -> GitHub CI evidence in this task.

- [ ] **Step 2: Run fresh full deploy gate on final head**

Run: `npm run deploy:gate`

Expected: exit 0.

- [ ] **Step 3: Compare branch against current main**

Review changed paths and confirm no unrelated GO City/Factory-menu files were modified.

- [ ] **Step 4: Open/update PR to `main`**

PR body must include:

- root cause: Factory truth and operational tools were parallel;
- new architecture: thin controller + Durable Object task authority + Reality Receipts;
- exact tests run;
- known non-goals: staged commits, QC hardening, conflict resolver, merge-base freshness, production probe, rollback;
- deployment risk: first Durable Object namespace/export;
- rollback: revert PR restores prior Worker/controller surface; Durable Object data may remain provisioned but unused until an explicit class-lifecycle deletion is designed.

- [ ] **Step 5: Verify exact-head PR Safety Gate**

Use exact PR head SHA. Do not merge on old green evidence.

- [ ] **Step 6: Guarded merge**

Merge only when PR is mergeable and exact-head checks are complete/success.

- [ ] **Step 7: Verify main SHA**

Require both:

- `STANDARD Safety Gate` success,
- `GO Hub Deploy` success.

- [ ] **Step 8: Production controller smoke**

Use the deployed MCP/browser Factory controller for a **read-only `inspect` action** on a disposable/new task ID and verify the result contains:

```text
revision = 1
receipt.action = inspect
receipt.status = success
task.repository = pureekangraw-ops/standard-
task.baseSha = current main SHA
```

Do not mutate production or create a branch merely to smoke the controller.

- [ ] **Step 9: Record remaining gaps as next audit queue**

The bridge completion must not silently claim the following solved:

- trusted QC canonicalization,
- staged/batch commit + preflight test,
- conflict resolution,
- base-fresh merge guard,
- production verification probe,
- operational rollback,
- stateful backup/restore/migration gate.

---

## Self-Review

### Spec coverage

- Server-side single task authority: Tasks 1 and 6.
- Reality Receipt contract: Task 2.
- Inspect/branch/write/delete/compare/PR/CI/failure evidence: Tasks 2–4.
- Persistence split-brain semantics: Tasks 1 and 3.
- Reconciliation: Task 5.
- MCP/browser operator surface: Task 6.
- GO City boundaries remain untouched: enforced by changed-path review in Task 7.
- Security/secret exclusion: Tasks 1–2.
- No QC redesign or rollback scope creep: explicit Task 7 remaining-gap list.

### Placeholder scan

No `TBD`, `TODO`, generic "handle errors", or undefined later-work placeholders are used. Every later item is either implemented in a named task or explicitly listed as a non-goal/next audit queue.

### Type consistency

- `taskId`, `action`, `input`, `expectedRevision` are used consistently for controller calls.
- Controller result consistently returns `status`, `receipt`, `task`, `revision`, `nextAction`, optional `reconciliation`.
- Durable authority consistently uses `revision`, `task`, `receipts`, `audit`.
- Receipt identity consistently uses repository plus branch/SHA/run/PR fields.
- Implemented action names are fixed to `inspect`, `create_branch`, `write`, `delete`, `compare`, `open_pr`, `check_ci`, `diagnose_failure`.
