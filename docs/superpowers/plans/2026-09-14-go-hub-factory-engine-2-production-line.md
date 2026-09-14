# GO Hub Factory Engine 2 — Production Line Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one bounded Work Package travel from mounted Blueprint through Production, Piece QC, sealing, and Ready Gate with exact evidence and no silent Blueprint drift.

**Architecture:** Extend the same resumable CodeTask truth established by Engine 1; do not introduce a second task authority. Add focused pure modules for evidence, Piece QC, and Ready Gate sealing, while CodeTask stores the resulting production truth and Workbench projects it. Existing GitHub inspect/write/diff/test machinery remains machinery; Engine 2 adds factory responsibility semantics around it.

**Tech Stack:** Vanilla JavaScript ES modules, Node `node:test`, existing GO Hub CodeTask/Workbench/persistence/runtime, GitHub workspace adapter.

**Spec:** `docs/superpowers/specs/2026-09-14-go-hub-code-station-engine-map-design.md`

## Global Constraints

- Start implementation only from the accepted Engine 1 main revision; do not build Engine 2 on a stale pre-Engine-1 branch.
- Preserve one task truth. Production, QC, Gate, Workbench, and resume must derive from the same CodeTask snapshot.
- **Blueprint stays mounted.** A Work Package cannot be produced or sealed without a Blueprint reference.
- Engine 2 proves only: `Blueprint -> Build Piece -> Piece QC -> Seal -> Ready Gate`.
- Engine 2 does not implement Assembly, Assembly QC, Build integration, Artifact Inspector, Product QC, Recovery Scanner, or Learning Recorder.
- Existing GitHub lifecycle state remains compatible. Factory stage is additional meaning, not a replacement for repository/PR/CI truth.
- Evidence must be structured and identify what claim it proves. No hard-coded PASS text in the shell.
- Ready Gate is a handoff boundary, not a second QC pass and not a human approval ceremony.
- A Piece cannot be sealed unless Piece QC has passed and exact repository/head evidence exists.
- Head changes after QC invalidate the seal-ready claim and require QC to run again.
- Legacy Engine 1 snapshots must restore safely with empty Engine 2 defaults.
- Use RED/GREEN only at high-risk state/evidence boundaries; functional behavior and Design Fidelity are the primary completion tests.
- `npm run deploy:gate` must pass before Engine 2 is considered assembled.

---

### Task 1: Add Production truth and factory stage to CodeTask

**Files:**
- Modify: `go-hub-code-task.js`
- Modify: `tests/go-hub-code-task.test.cjs`

**Interfaces:**
- Consumes: Engine 1 `mission`, `blueprint`, `currentPiece`, `evidence`, `setWorkbenchTruth()` and existing lifecycle snapshot.
- Produces snapshot fields:
  - `factoryStage: "PRODUCTION" | "PIECE_QC" | "READY_GATE" | null`
  - `workPackage: { id, title, purpose, blueprintRef, inputs, expectedOutputs, dependencies, assemblyTarget } | null`
  - `piece: { id, workPackageId, repository, branch, headSha, changedPaths, outputs } | null`
  - `pieceQc: { status, checkedHeadSha, checks, evidenceIds, checkedAt } | null`
  - `gateHandoff: object | null`
- Produces task methods `setWorkPackage(input)`, `recordPiece(input)`, `recordPieceQc(input)`, `recordGateHandoff(input)`.

- [ ] **Step 1: Add boundary tests**

Add tests that assert a new/legacy task restores safe defaults and that setting a Work Package requires the currently mounted Blueprint reference to match `workPackage.blueprintRef`.

```js
test("production truth is resumable and bound to the mounted blueprint", async () => {
  const { createCodeTask } = await load();
  let task = createCodeTask({ id: "e2-1", repository: "pureekangraw-ops/standard-" })
    .setWorkbenchTruth({
      blueprint: { title: "Factory Blueprint", ref: "spec.md", status: "approved" },
      currentPiece: { id: "wp-1", title: "Piece Controller", purpose: "control one work package" },
    });

  task = task.setWorkPackage({
    id: "wp-1", title: "Piece Controller", purpose: "control one work package",
    blueprintRef: "spec.md", inputs: ["CodeTask snapshot"], expectedOutputs: ["sealed piece"],
    dependencies: [], assemblyTarget: "Engine 2 production line",
  });

  const snapshot = task.snapshot();
  assert.equal(snapshot.factoryStage, "PRODUCTION");
  assert.equal(snapshot.workPackage.id, "wp-1");
  assert.equal(snapshot.gateHandoff, null);
});
```

Add rejection for mismatched Blueprint reference and legacy default assertions.

- [ ] **Step 2: Run targeted tests**

```bash
node --test tests/go-hub-code-task.test.cjs
```

Expected: new tests fail before implementation.

- [ ] **Step 3: Implement minimum production fields and methods**

Normalize missing fields to `null` in `normalizeInitial`/`normalizeSnapshot`. `setWorkPackage()` must require a non-empty mounted `blueprint.ref` equal to `input.blueprintRef`, set `factoryStage` to `PRODUCTION`, replace stale `piece`, `pieceQc`, and `gateHandoff` with `null`, update `currentPiece` from the Work Package identity, and append `WORK_PACKAGE_STARTED` audit.

`recordPiece(input)` must require the active `workPackage`, matching `workPackageId`, non-empty `repository`, `branch`, and `headSha`; it stores exact `changedPaths`/`outputs` and clears `pieceQc`/`gateHandoff` because the produced revision changed.

`recordPieceQc(input)` stores a normalized Piece QC result and sets `factoryStage` to `PIECE_QC`.

`recordGateHandoff(input)` stores the sealed handoff and sets `factoryStage` to `READY_GATE`.

- [ ] **Step 4: Run task tests**

```bash
node --test tests/go-hub-code-task.test.cjs
```

Expected: all task tests pass, including legacy lifecycle tests.

- [ ] **Step 5: Commit**

```bash
git add go-hub-code-task.js tests/go-hub-code-task.test.cjs
git commit -m "feat: add production line truth to code task"
```

---

### Task 2: Create Evidence Ledger

**Files:**
- Create: `go-hub-evidence-ledger.js`
- Create: `tests/go-hub-evidence-ledger.test.cjs`
- Modify: `go-hub-code-task.js`
- Modify: `package.json`

**Interfaces:**
- Produces `createEvidenceEntry(input)` and `appendEvidence(ledger, input)`.
- Evidence shape:
  `{ id, scope, claim, kind, value, repository, headSha, recordedAt }` where `scope` is `piece | assembly | artifact`.
- CodeTask method `addEvidence(input)` appends one normalized entry to the existing Engine 1 `evidence` array.

- [ ] **Step 1: Write failing Evidence Ledger tests**

```js
test("piece evidence names the claim and exact head it proves", async () => {
  const { createEvidenceEntry } = await load();
  const item = createEvidenceEntry({
    id: "ev-1", scope: "piece", claim: "diff-reviewed", kind: "diff",
    value: "diff-fingerprint-1", repository: "pureekangraw-ops/standard-",
    headSha: "head-1", recordedAt: "2026-09-14T12:00:00.000Z",
  });
  assert.equal(item.scope, "piece");
  assert.equal(item.claim, "diff-reviewed");
  assert.equal(item.headSha, "head-1");
});
```

Reject missing `id`, `scope`, `claim`, `kind`, or `headSha` for `piece` evidence.

- [ ] **Step 2: Run tests and confirm RED**

```bash
node --test tests/go-hub-evidence-ledger.test.cjs
```

- [ ] **Step 3: Implement ledger and CodeTask adapter**

`createEvidenceEntry()` must clone input, validate required fields, and return a frozen normalized object. `appendEvidence()` returns a new array and rejects duplicate IDs. `CodeTask.addEvidence()` calls the pure ledger helper and appends `EVIDENCE_RECORDED` audit with evidence ID, claim, and head SHA.

- [ ] **Step 4: Add syntax check and run targeted tests**

Add `go-hub-evidence-ledger.js` to `check:syntax`, then run:

```bash
node --test tests/go-hub-evidence-ledger.test.cjs tests/go-hub-code-task.test.cjs
npm run check:syntax
```

- [ ] **Step 5: Commit**

```bash
git add go-hub-evidence-ledger.js tests/go-hub-evidence-ledger.test.cjs go-hub-code-task.js tests/go-hub-code-task.test.cjs package.json
git commit -m "feat: add production evidence ledger"
```

---

### Task 3: Create Piece QC Bench with head-bound evidence

**Files:**
- Create: `go-hub-piece-qc.js`
- Create: `tests/go-hub-piece-qc.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces `evaluatePieceQc({ workPackage, piece, blueprint, evidence })`.
- Returns `{ status: "pass" | "fail", checkedHeadSha, checks, evidenceIds, checkedAt }`.
- Required checks: `purpose`, `behavior`, `interface`, `evidence`.

- [ ] **Step 1: Write failing Piece QC tests**

Create one passing case where the Work Package and Piece IDs match, Blueprint ref matches, Piece has exact `headSha`, and evidence for that same head contains claims `purpose-correct`, `behavior-correct`, `interface-correct`. Create failing cases for stale-head evidence, Blueprint mismatch, and missing interface evidence.

Expected PASS object must contain:

```js
{
  status: "pass",
  checkedHeadSha: "head-1",
  checks: { purpose: true, behavior: true, interface: true, evidence: true },
  evidenceIds: ["ev-purpose", "ev-behavior", "ev-interface"],
  checkedAt: /* ISO timestamp */,
}
```

- [ ] **Step 2: Run Piece QC tests and confirm RED**

```bash
node --test tests/go-hub-piece-qc.test.cjs
```

- [ ] **Step 3: Implement Piece QC**

The evaluator must never mutate input. It must fail closed when Work Package/Piece/Blueprint is missing, when `piece.workPackageId !== workPackage.id`, when `workPackage.blueprintRef !== blueprint.ref`, or when evidence belongs to another head. `evidenceIds` includes only entries used to prove the result.

- [ ] **Step 4: Run tests and syntax check**

```bash
node --test tests/go-hub-piece-qc.test.cjs
npm run check:syntax
```

- [ ] **Step 5: Commit**

```bash
git add go-hub-piece-qc.js tests/go-hub-piece-qc.test.cjs package.json
git commit -m "feat: add piece qc bench"
```

---

### Task 4: Create Ready Gate / Sealer

**Files:**
- Create: `go-hub-ready-gate.js`
- Create: `tests/go-hub-ready-gate.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces `sealReadyGate({ workPackage, piece, blueprint, pieceQc, evidence, knownLimitations })`.
- Returns handoff:
  `{ pieceId, workPackageId, blueprintRef, inputs, outputs, dependencies, repository, branch, headSha, changedPaths, pieceQc, evidenceIds, knownLimitations, assemblyTarget, sealedAt, status: "READY_FOR_ASSEMBLY" }`.

- [ ] **Step 1: Write failing sealing tests**

A valid case must seal only when `pieceQc.status === "pass"`, `pieceQc.checkedHeadSha === piece.headSha`, the Blueprint ref still matches, and every `pieceQc.evidenceIds` entry exists and is bound to the same head.

Add rejection tests for:
- QC fail
- head changed after QC
- missing evidence ID
- Blueprint mismatch

- [ ] **Step 2: Run Ready Gate tests and confirm RED**

```bash
node --test tests/go-hub-ready-gate.test.cjs
```

- [ ] **Step 3: Implement sealer**

The sealer performs handoff completeness validation only; it must not rerun Piece QC. It copies exact repository/branch/head/changed-path evidence from the Piece and returns an immutable handoff.

- [ ] **Step 4: Run tests and syntax check**

```bash
node --test tests/go-hub-ready-gate.test.cjs
npm run check:syntax
```

- [ ] **Step 5: Commit**

```bash
git add go-hub-ready-gate.js tests/go-hub-ready-gate.test.cjs package.json
git commit -m "feat: add ready gate sealer"
```

---

### Task 5: Wire the Production Line into Workbench and resume

**Files:**
- Modify: `go-hub-workbench-model.js`
- Modify: `tests/go-hub-workbench-model.test.cjs`
- Modify: `go-hub-code-module.js`
- Modify: `tests/go-hub-code-module.test.cjs`
- Modify: `tests/go-hub-persistence.test.cjs`

**Interfaces:**
- Workbench `status` uses `factoryStage` when present and falls back to existing lifecycle `state` for legacy/Engine 1 snapshots.
- Workbench `evidence` remains the same CodeTask ledger.
- Code capability projection exposes `factoryStage`, `workPackage`, `piece`, `pieceQc`, `gateHandoff` from the same restored task snapshot.

- [ ] **Step 1: Add failing projection/resume tests**

Prove that a task saved at `READY_GATE` restores with exact Work Package, Piece, Piece QC, evidence IDs, and handoff, and `createWorkbenchView()` returns `status: "READY_GATE"` without inventing state.

- [ ] **Step 2: Run focused tests and confirm failures**

```bash
node --test tests/go-hub-workbench-model.test.cjs tests/go-hub-code-module.test.cjs tests/go-hub-persistence.test.cjs
```

- [ ] **Step 3: Implement projection/wiring**

Use shallow capability projection from the single snapshot. Do not add a second persistence key or shell-owned factory object.

- [ ] **Step 4: Run focused tests**

```bash
node --test tests/go-hub-workbench-model.test.cjs tests/go-hub-code-module.test.cjs tests/go-hub-persistence.test.cjs
```

- [ ] **Step 5: Commit**

```bash
git add go-hub-workbench-model.js tests/go-hub-workbench-model.test.cjs go-hub-code-module.js tests/go-hub-code-module.test.cjs tests/go-hub-persistence.test.cjs
git commit -m "feat: resume production line through workbench"
```

---

### Task 6: Functional proof and Engine 2 assembly review

**Files:**
- Modify tests only if the proof exposes a contract gap; do not add production code merely to satisfy ceremony.

**Interfaces:**
- End-to-end proof: CodeTask + mounted Blueprint + Work Package + Piece + Evidence Ledger + Piece QC + Ready Gate + persistence restore + Workbench projection.

- [ ] **Step 1: Add one production-line scenario test**

The scenario must:
1. create/restore an Engine 1-capable task,
2. mount Blueprint and Work Package,
3. record one Piece with exact repository/branch/head/changed paths,
4. add three head-bound evidence entries for purpose/behavior/interface,
5. evaluate Piece QC and store the result,
6. seal Ready Gate and store the handoff,
7. persist and reload,
8. prove Workbench status is `READY_GATE`, handoff head equals Piece head, evidence IDs survive exactly, and Blueprint ref is unchanged.

- [ ] **Step 2: Run the production-line proof**

```bash
node --test tests/go-hub-code-task.test.cjs tests/go-hub-evidence-ledger.test.cjs tests/go-hub-piece-qc.test.cjs tests/go-hub-ready-gate.test.cjs tests/go-hub-workbench-model.test.cjs tests/go-hub-code-module.test.cjs tests/go-hub-persistence.test.cjs
```

Expected: PASS.

- [ ] **Step 3: Run full assembly gate**

```bash
npm run deploy:gate
```

Expected: PASS.

- [ ] **Step 4: Design Fidelity review**

Confirm from behavior/evidence, not labels:
- One Work Package travels `Blueprint -> Production -> Piece QC -> Seal -> Ready Gate`.
- Blueprint remains mounted and unchanged throughout the scenario.
- QC evidence is tied to the exact Piece head.
- Changing the head invalidates sealing until QC is rerun.
- Ready Gate contains complete handoff data but does not duplicate Piece QC.
- Resume preserves the exact production truth without chat reconstruction.
- No Assembly/Product QC/Task Authority framework was introduced.

If any item fails, Engine 2 is not complete even when CI is green.

- [ ] **Step 5: Commit any proof-only changes**

```bash
git add tests
git commit -m "test: prove engine 2 production line"
```

## Engine 2 Completion Boundary

Engine 2 is complete when one real Work Package can be produced, evidenced, Piece-QC checked, sealed, restored, and presented at Ready Gate with the same Blueprint and exact source/head evidence. The next engine receives `READY_FOR_ASSEMBLY`; Engine 2 does not perform Assembly itself.
