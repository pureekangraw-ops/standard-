# GO Hub Factory Engine 1 — Truth & Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GO enter Code Workstation and immediately see one resumable truth set: `Mission | Blueprint | Current Piece | Status | Evidence | Next`, restored from the same durable CodeTask snapshot without reconstructing chat context.

**Architecture:** `go-hub-code-task.js` remains the single task truth for Engine 1. Add the minimum Workbench truth fields to that snapshot, project them through a pure `go-hub-workbench-model.js`, and let `go-hub-shell.js` render the projection only. Local persistence remains the continuity cache for Engine 1; this plan does not introduce Durable Objects, a second task authority, or a new lifecycle engine.

**Tech Stack:** Vanilla JavaScript ES modules, Node `node:test`, browser DOM/localStorage, existing GO Hub runtime and Code capability.

**Spec:** `docs/superpowers/specs/2026-09-14-go-hub-code-station-engine-map-design.md`

## Global Constraints

- Workbench must show exactly the six minimum truths: `Mission | Blueprint | Current Piece | Status | Evidence | Next`.
- **Blueprint stays mounted.** Blueprint must remain visible beside current piece, lifecycle status, evidence, and next action.
- Workbench must derive from the same restored CodeTask snapshot; do not create duplicate shell state.
- GitHub remains source of truth for repository, branch, commit, PR, CI, merge, and deploy evidence.
- Local persistence remains continuity cache for Engine 1; do not add Durable Object / Task Authority in this engine.
- Existing Code capability lifecycle contracts and state transitions must remain compatible.
- Legacy task snapshots that predate Workbench fields must still restore safely.
- Evidence is data, not decoration. The shell renders evidence from snapshot/projection, never hard-coded success claims.
- `npm run deploy:gate` must pass before Engine 1 is considered assembled.
- Engine 1 completion boundary: one restored task opens in GO Hub and its Workbench truth is understandable without reconstructing chat. Engine 1 does **not** claim Piece QC, Ready Gate, Assembly QC, Product QC, or server-side Task Authority are complete.

---

### Task 1: Add Workbench truth to CodeTask

**Files:**
- Modify: `go-hub-code-task.js`
- Modify: `tests/go-hub-code-task.test.cjs`

**Interfaces:**
- Consumes: existing `createCodeTask(initial)`, `createCodeTaskFromSnapshot(snapshot)`, `snapshot()`, `appendAudit(event, details)`.
- Produces: snapshot fields `mission`, `blueprint`, `currentPiece`, `evidence`; task method `setWorkbenchTruth(input)`.

- [ ] **Step 1: Add failing tests for default Workbench truth and explicit update**

Append tests equivalent to:

```js
test("task stores one workbench truth set and audits the update", async () => {
  const { createCodeTask } = await load();
  let task = createCodeTask({ id: "wb-1", intent: "build workstation", repository: "pureekangraw-ops/standard-" });
  assert.equal(task.mission, null);
  assert.equal(task.blueprint, null);
  assert.equal(task.currentPiece, null);
  assert.deepEqual(task.evidence, []);

  task = task.setWorkbenchTruth({
    mission: { summary: "Build Engine 1", outcome: "Resumable Workbench truth" },
    blueprint: { title: "Factory Blueprint", ref: "docs/superpowers/specs/2026-09-14-go-hub-code-station-engine-map-design.md", status: "approved" },
    currentPiece: { id: "engine-1", title: "Truth & Workbench", purpose: "Expose one resumable truth set" },
    evidence: [{ kind: "design", label: "Approved blueprint", value: "aa7d779" }],
  });

  const snapshot = task.snapshot();
  assert.equal(snapshot.mission.summary, "Build Engine 1");
  assert.equal(snapshot.blueprint.status, "approved");
  assert.equal(snapshot.currentPiece.id, "engine-1");
  assert.deepEqual(snapshot.evidence, [{ kind: "design", label: "Approved blueprint", value: "aa7d779" }]);
  assert.equal(snapshot.audit.at(-1).event, "WORKBENCH_TRUTH_UPDATED");
});
```

Add a second test for legacy restore:

```js
test("legacy snapshots restore with safe workbench defaults", async () => {
  const { createCodeTaskFromSnapshot } = await load();
  const legacy = {
    id: "legacy", intent: "resume", repository: "pureekangraw-ops/standard-",
    state: "INSPECTING", nextAction: "inspect", baseBranch: null, baseSha: null,
    workBranch: null, headSha: null, touchedPaths: [], diffFingerprint: null,
    blocker: null, pullRequest: null, ci: null, merge: null, deployment: null,
    verification: null, rollback: null, audit: [],
  };
  const restored = createCodeTaskFromSnapshot(legacy).snapshot();
  assert.equal(restored.mission, null);
  assert.equal(restored.blueprint, null);
  assert.equal(restored.currentPiece, null);
  assert.deepEqual(restored.evidence, []);
});
```

- [ ] **Step 2: Run the targeted test file and verify the new tests fail**

Run:

```bash
node --test tests/go-hub-code-task.test.cjs
```

Expected: failures because Workbench fields/method do not yet exist.

- [ ] **Step 3: Implement minimum Workbench truth support**

In `normalizeInitial(initial)` add:

```js
mission: null,
blueprint: null,
currentPiece: null,
evidence: [],
```

In `normalizeSnapshot(value)` normalize missing legacy fields without changing existing lifecycle state validation:

```js
state.mission = state.mission == null ? null : clone(state.mission);
state.blueprint = state.blueprint == null ? null : clone(state.blueprint);
state.currentPiece = state.currentPiece == null ? null : clone(state.currentPiece);
state.evidence = Array.isArray(state.evidence) ? clone(state.evidence) : [];
```

Add a pure updater:

```js
function setWorkbenchTruthState(current, input = {}) {
  const next = clone(current);
  if (Object.hasOwn(input, "mission")) next.mission = input.mission == null ? null : clone(input.mission);
  if (Object.hasOwn(input, "blueprint")) next.blueprint = input.blueprint == null ? null : clone(input.blueprint);
  if (Object.hasOwn(input, "currentPiece")) next.currentPiece = input.currentPiece == null ? null : clone(input.currentPiece);
  if (Object.hasOwn(input, "evidence")) next.evidence = Array.isArray(input.evidence) ? clone(input.evidence) : [];
  next.audit.push({ at: now(), event: "WORKBENCH_TRUTH_UPDATED" });
  return next;
}
```

Expose from `wrap(state)`:

```js
setWorkbenchTruth(input = {}) {
  return wrap(setWorkbenchTruthState(state, input));
},
```

- [ ] **Step 4: Run targeted tests and confirm lifecycle compatibility**

Run:

```bash
node --test tests/go-hub-code-task.test.cjs
```

Expected: all task tests pass, including existing SHA-bound lifecycle tests.

- [ ] **Step 5: Commit Task 1**

```bash
git add go-hub-code-task.js tests/go-hub-code-task.test.cjs
git commit -m "feat: add workbench truth to code task"
```

---

### Task 2: Add pure Workbench projection

**Files:**
- Create: `go-hub-workbench-model.js`
- Create: `tests/go-hub-workbench-model.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: a plain CodeTask snapshot.
- Produces: `createWorkbenchView(taskSnapshot)` returning `{ mission, blueprint, currentPiece, status, evidence, next, blocker }`.

- [ ] **Step 1: Write failing projection tests**

Create `tests/go-hub-workbench-model.test.cjs` with tests equivalent to:

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = pathToFileURL(path.join(root, "go-hub-workbench-model.js")).href;

async function load() {
  return import(`${moduleUrl}?workbench=${Date.now()}-${Math.random()}`);
}

test("projects the six mounted workbench truths from one task snapshot", async () => {
  const { createWorkbenchView } = await load();
  const view = createWorkbenchView({
    mission: { summary: "Build Engine 1", outcome: "Resume safely" },
    blueprint: { title: "Factory Blueprint", ref: "spec.md", status: "approved" },
    currentPiece: { id: "engine-1", title: "Truth & Workbench", purpose: "Show one truth set" },
    state: "EDITING",
    nextAction: "review-diff",
    blocker: null,
    evidence: [{ kind: "diff", label: "Current diff", value: "abc" }],
  });
  assert.equal(view.mission.summary, "Build Engine 1");
  assert.equal(view.blueprint.ref, "spec.md");
  assert.equal(view.currentPiece.id, "engine-1");
  assert.equal(view.status, "EDITING");
  assert.deepEqual(view.evidence, [{ kind: "diff", label: "Current diff", value: "abc" }]);
  assert.equal(view.next, "review-diff");
  assert.equal(view.blocker, null);
});

test("returns safe empty truth instead of inventing missing workbench state", async () => {
  const { createWorkbenchView } = await load();
  const view = createWorkbenchView({ state: "INSPECTING", nextAction: "inspect", blocker: null });
  assert.equal(view.mission, null);
  assert.equal(view.blueprint, null);
  assert.equal(view.currentPiece, null);
  assert.deepEqual(view.evidence, []);
  assert.equal(view.status, "INSPECTING");
  assert.equal(view.next, "inspect");
});
```

- [ ] **Step 2: Run projection tests and verify failure**

```bash
node --test tests/go-hub-workbench-model.test.cjs
```

Expected: module not found.

- [ ] **Step 3: Implement the pure projection**

Create `go-hub-workbench-model.js`:

```js
function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function createWorkbenchView(taskSnapshot = {}) {
  return Object.freeze({
    mission: taskSnapshot.mission == null ? null : clone(taskSnapshot.mission),
    blueprint: taskSnapshot.blueprint == null ? null : clone(taskSnapshot.blueprint),
    currentPiece: taskSnapshot.currentPiece == null ? null : clone(taskSnapshot.currentPiece),
    status: String(taskSnapshot.state || "UNKNOWN"),
    evidence: Array.isArray(taskSnapshot.evidence) ? clone(taskSnapshot.evidence) : [],
    next: String(taskSnapshot.nextAction || ""),
    blocker: taskSnapshot.blocker == null ? null : String(taskSnapshot.blocker),
  });
}
```

- [ ] **Step 4: Add the new module to syntax validation**

Update `package.json` `check:syntax` so `node --check go-hub-workbench-model.js` runs alongside existing GO Hub syntax checks.

- [ ] **Step 5: Run projection tests plus syntax check**

```bash
node --test tests/go-hub-workbench-model.test.cjs
npm run check:syntax
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add go-hub-workbench-model.js tests/go-hub-workbench-model.test.cjs package.json
git commit -m "feat: project code task into workbench truth"
```

---

### Task 3: Mount Workbench in the GO Hub shell

**Files:**
- Modify: `go-hub-shell.js`
- Modify: `go-hub.html`
- Modify: `index.html`
- Modify: `go-hub-shell.css`
- Modify: `tests/go-hub-shell.test.cjs`

**Interfaces:**
- Consumes: restored task snapshot/session and `createWorkbenchView(snapshot)`.
- Produces: rendered DOM fields `[data-workbench-mission]`, `[data-workbench-blueprint]`, `[data-workbench-piece]`, `[data-workbench-status]`, `[data-workbench-evidence]`, `[data-workbench-next]`.

- [ ] **Step 1: Add failing shell contract tests**

Extend `tests/go-hub-shell.test.cjs` to assert the shell imports `createWorkbenchView` and both HTML entry points contain the six selectors:

```js
[
  "data-workbench-mission",
  "data-workbench-blueprint",
  "data-workbench-piece",
  "data-workbench-status",
  "data-workbench-evidence",
  "data-workbench-next",
].forEach((selector) => {
  assert.match(goHubHtml, new RegExp(selector));
  assert.match(indexHtml, new RegExp(selector));
});
```

Also assert shell source contains a call equivalent to `createWorkbenchView(task.snapshot())` or the restored snapshot used by the session, rather than a separately hard-coded mission object.

- [ ] **Step 2: Run shell tests and verify failure**

```bash
node --test tests/go-hub-shell.test.cjs
```

Expected: failures because Workbench DOM/projection wiring is absent.

- [ ] **Step 3: Add Workbench markup to both entry documents**

Place a compact Workbench section in the existing main GO Hub content, preserving current page structure. Each document must include:

```html
<section class="go-workbench" aria-label="GO Workbench">
  <div class="go-workbench__item"><span>Mission</span><strong data-workbench-mission>—</strong></div>
  <div class="go-workbench__item"><span>Blueprint</span><strong data-workbench-blueprint>—</strong></div>
  <div class="go-workbench__item"><span>Current Piece</span><strong data-workbench-piece>—</strong></div>
  <div class="go-workbench__item"><span>Status</span><strong data-workbench-status>—</strong></div>
  <div class="go-workbench__item"><span>Evidence</span><strong data-workbench-evidence>—</strong></div>
  <div class="go-workbench__item"><span>Next</span><strong data-workbench-next>—</strong></div>
</section>
```

- [ ] **Step 4: Wire projection-only rendering in `go-hub-shell.js`**

Import:

```js
import { createWorkbenchView } from "./go-hub-workbench-model.js";
```

Add a renderer that receives a task snapshot and derives all display values from `createWorkbenchView(snapshot)`:

```js
function renderWorkbench(snapshot) {
  const view = createWorkbenchView(snapshot || {});
  const mission = document.querySelector("[data-workbench-mission]");
  const blueprint = document.querySelector("[data-workbench-blueprint]");
  const piece = document.querySelector("[data-workbench-piece]");
  const status = document.querySelector("[data-workbench-status]");
  const evidence = document.querySelector("[data-workbench-evidence]");
  const next = document.querySelector("[data-workbench-next]");

  if (mission) mission.textContent = view.mission?.summary || "—";
  if (blueprint) blueprint.textContent = view.blueprint?.title || view.blueprint?.ref || "—";
  if (piece) piece.textContent = view.currentPiece?.title || view.currentPiece?.id || "—";
  if (status) status.textContent = view.status || "UNKNOWN";
  if (evidence) evidence.textContent = view.evidence.length ? view.evidence.map((item) => item.label || item.kind || String(item.value || "evidence")).join(" · ") : "—";
  if (next) next.textContent = view.blocker ? `BLOCKED — ${view.blocker}` : (view.next || "—");
}
```

Call `renderWorkbench(...)` after task restoration/loading and whenever the shell updates the active task snapshot through the existing task session seam. Do not introduce a second task object in shell state.

- [ ] **Step 5: Add compact responsive styling**

In `go-hub-shell.css`, add a mobile-first grid/flex treatment for `.go-workbench` and `.go-workbench__item` that fits narrow Android screens, wraps long Blueprint/Evidence text, and does not rely on fixed pixel widths. Preserve existing visual tokens instead of introducing a new design system.

- [ ] **Step 6: Run shell tests and syntax check**

```bash
node --test tests/go-hub-shell.test.cjs
npm run check:syntax
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add go-hub-shell.js go-hub.html index.html go-hub-shell.css tests/go-hub-shell.test.cjs
git commit -m "feat: mount truth workbench in hub shell"
```

---

### Task 4: Prove resume fidelity and Engine 1 assembly

**Files:**
- Modify: `tests/go-hub-persistence.test.cjs`
- Modify: `tests/go-hub-module-load.test.cjs`
- Modify as needed only if an existing session seam requires compatibility adjustment: `go-hub-persistence.js`, `go-hub-code-module.js`, `go-hub-shell.js`

**Interfaces:**
- Consumes: CodeTask snapshot with Workbench truth, existing task session save/load, `createWorkbenchView`.
- Produces: regression proof that saved truth restores exactly and projects without chat reconstruction.

- [ ] **Step 1: Add a resume-fidelity regression test**

Create or extend a persistence/session test to:

1. create a task,
2. call `setWorkbenchTruth(...)`,
3. save the snapshot through the existing Code task session,
4. reload it,
5. project it with `createWorkbenchView`,
6. assert exact Mission / Blueprint / Current Piece / Status / Evidence / Next values.

Use values that prove Blueprint remains mounted, for example:

```js
mission: { summary: "Build Engine 1", outcome: "GO resumes without chat" }
blueprint: { title: "Factory Blueprint", ref: "docs/superpowers/specs/2026-09-14-go-hub-code-station-engine-map-design.md", status: "approved" }
currentPiece: { id: "engine-1", title: "Truth & Workbench", purpose: "Expose resumable truth" }
evidence: [{ kind: "design", label: "Blueprint commit", value: "aa7d779" }]
```

- [ ] **Step 2: Run focused Engine 1 tests**

```bash
node --test \
  tests/go-hub-code-task.test.cjs \
  tests/go-hub-workbench-model.test.cjs \
  tests/go-hub-shell.test.cjs \
  tests/go-hub-persistence.test.cjs \
  tests/go-hub-module-load.test.cjs
```

Expected: PASS.

- [ ] **Step 3: Run the full deployment gate**

```bash
npm run deploy:gate
```

Expected: all tests, syntax, UTF-8, and no-ride checks pass.

- [ ] **Step 4: Perform Engine 1 Design Fidelity review**

Verify against the approved Factory Blueprint:

1. All six Workbench truths are visible.
2. They derive from the same restored CodeTask snapshot.
3. Blueprint is visible beside Current Piece / lifecycle Status / Evidence / Next.
4. Legacy snapshots restore without crashing.
5. Existing Code lifecycle authority and GitHub evidence semantics are unchanged.
6. No Durable Object, Task Authority, Ready Gate, Assembly QC, or unrelated framework has been introduced into Engine 1.
7. A new GO can understand the active task from the restored Workbench truth without reconstructing chat history.

If any item fails, Engine 1 remains red and must be corrected before PR/merge.

- [ ] **Step 5: Commit assembly/fidelity test changes**

```bash
git add tests/go-hub-persistence.test.cjs tests/go-hub-module-load.test.cjs go-hub-persistence.js go-hub-code-module.js go-hub-shell.js
git commit -m "test: prove engine one resume fidelity"
```

Only stage production files that were actually required.

- [ ] **Step 6: Open PR with evidence-bound summary**

PR title:

```text
GO Hub Factory Engine 1: Truth & Workbench
```

PR body must state:

- Spec path and approved design commit `aa7d779c7c7a0eaa9fcbc8d172689e476c63a24a`.
- Workbench six-truth contract.
- Blueprint-stays-mounted proof.
- Legacy snapshot compatibility.
- Focused test result and full `npm run deploy:gate` result.
- Explicit non-goals: no Piece QC / Ready Gate / Assembly QC / Product QC / Task Authority in Engine 1.

- [ ] **Step 7: Merge only after current-head CI is green and then verify deploy**

Use exact current PR head SHA for CI/merge evidence. After merge, observe GO Hub Deploy for the merge SHA and record the result. Deployment success alone does not prove Product QC; Engine 1 completion claim is limited to Truth & Workbench assembly.

---

## Engine 1 Done Definition

Engine 1 is complete only when a persisted CodeTask can be restored into GO Hub and the Workbench immediately exposes `Mission | Blueprint | Current Piece | Status | Evidence | Next` from that same task truth, with Blueprint still mounted and all existing lifecycle safety contracts intact.
