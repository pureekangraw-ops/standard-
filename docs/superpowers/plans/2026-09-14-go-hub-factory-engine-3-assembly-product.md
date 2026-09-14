# GO Hub Factory Engine 3 — Assembly & Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept sealed Engine 2 pieces, assemble and QC them, bind a build artifact to the accepted source, and verify that real artifact evidence satisfies the mounted Blueprint.

**Architecture:** Extend the single resumable CodeTask truth. Reuse the Engine 2 Evidence Ledger and exact-head rules; add four small pure stations—Assembly, Assembly QC, Build/Artifact binding, and Product QC—then project their results through the existing persistence and Workbench seams.

**Tech Stack:** Vanilla JavaScript ES modules, Node `node:test`, existing CodeTask/Workbench/persistence/publication contracts.

**Spec:** `docs/superpowers/specs/2026-09-14-go-hub-code-station-engine-map-design.md`

## Global Constraints

- Start from locked Engine 2 main SHA `98fbc333f06e51dcceddda7514184a7836250a3c`.
- Preserve one CodeTask authority and one persistence key.
- Blueprint stays mounted through Assembly, Build, and Product QC.
- Every assembly/artifact claim is bound to its exact source head or digest.
- Build success proves an artifact exists; only Product QC may declare `PRODUCT_VERIFIED`.
- Engine 3 stops at `PRODUCT_VERIFIED`; no Verification Scanner, Housekeeper, Learning Recorder, or Engine 4 behavior.
- Reuse the Evidence Ledger and publication machinery; add no dependencies or paid services.
- `npm run deploy:gate` and Design Fidelity review must pass before lock.

---

### Task 1: Add resumable Assembly/Product truth

**Files:** Modify `go-hub-code-task.js`, `tests/go-hub-code-task.test.cjs`.

**Interfaces:** Add snapshot fields `assembly`, `assemblyQc`, `buildArtifact`, `productQc`; add methods `recordAssembly`, `recordAssemblyQc`, `recordBuildArtifact`, `recordProductQc`. Stages are `ASSEMBLY`, `ASSEMBLY_QC`, `BUILD`, `PRODUCT_QC`, `PRODUCT_VERIFIED`.

- [ ] Write tests proving legacy defaults, exact stage transitions, and downstream invalidation when assembly/artifact changes.
- [ ] Run `node --test tests/go-hub-code-task.test.cjs` and observe RED.
- [ ] Implement normalized fields and guarded record methods. `recordProductQc` may set `PRODUCT_VERIFIED` only for a passing result bound to the current artifact digest.
- [ ] Run the targeted test and observe GREEN.
- [ ] Commit `feat: add assembly and product truth to code task`.

### Task 2: Build the Assembly Bench

**Files:** Create `go-hub-assembly-bench.js`, `tests/go-hub-assembly-bench.test.cjs`; modify `package.json`.

**Interfaces:** `assembleReadyPieces({ id, blueprint, handoffs, repository, integrationBranch, integrationHeadSha })` returns immutable `{ id, blueprintRef, pieceIds, sourceHeads, repository, integrationBranch, integrationHeadSha, inputs, outputs, dependencies, status: "ASSEMBLED", assembledAt }`.

- [ ] Test a successful assembly and rejection of non-ready handoffs, duplicate pieces, Blueprint mismatch, and missing exact heads.
- [ ] Run `node --test tests/go-hub-assembly-bench.test.cjs` and observe RED.
- [ ] Implement a pure fail-closed assembler without mutating handoffs.
- [ ] Run targeted tests and syntax check.
- [ ] Commit `feat: add assembly bench`.

### Task 3: Build Assembly QC

**Files:** Create `go-hub-assembly-qc.js`, `tests/go-hub-assembly-qc.test.cjs`; modify `go-hub-evidence-ledger.js`, `package.json`.

**Interfaces:** `evaluateAssemblyQc({ assembly, blueprint, evidence })` returns `{ status, checkedHeadSha, checks: { structure, flow, combinedBehavior, evidence }, evidenceIds, checkedAt }`. Required assembly claims are `structure-correct`, `flow-correct`, `combined-behavior-correct`.

- [ ] Test PASS plus stale-head, Blueprint mismatch, and missing-flow evidence failures. Test that assembly evidence requires `headSha`.
- [ ] Run targeted tests and observe RED.
- [ ] Extend ledger exact-head validation to `assembly`; implement pure fail-closed QC.
- [ ] Run targeted tests and syntax check.
- [ ] Commit `feat: add assembly qc bench`.

### Task 4: Bind Build artifact and inspect reality evidence

**Files:** Create `go-hub-artifact.js`, `tests/go-hub-artifact.test.cjs`; modify `go-hub-evidence-ledger.js`, `package.json`.

**Interfaces:** `createBuildArtifact({ id, kind, assembly, assemblyQc, digest, location, builtAt })` returns immutable artifact bound to `assembly.id` and `assembly.integrationHeadSha`. `inspectArtifact({ artifact, evidence })` returns exact-digest evidence IDs for `artifact-loads` and `source-binding-correct`.

- [ ] Test rejection of failed/stale Assembly QC, missing digest/location, and evidence for another digest. Test artifact evidence requires a non-empty `value.digest` matching the inspected artifact.
- [ ] Run tests and observe RED.
- [ ] Implement build binding and inspection; extend ledger validation for artifact evidence.
- [ ] Run tests and syntax check.
- [ ] Commit `feat: bind build artifacts to accepted assembly`.

### Task 5: Build Product QC and projection

**Files:** Create `go-hub-product-qc.js`, `tests/go-hub-product-qc.test.cjs`; modify `go-hub-code-module.js`, `go-hub-workbench-model.js`, related tests, and `package.json`.

**Interfaces:** `evaluateProductQc({ artifact, blueprint, evidence })` requires exact-digest claims `artifact-loads`, `core-flow-correct`, and `blueprint-outcome-correct`; returns `{ status, artifactId, artifactDigest, checks, evidenceIds, checkedAt }`. Project all Engine 3 fields from the same snapshot; Workbench status uses the factory stage.

- [ ] Test PASS and failures for stale digest, Blueprint mismatch, and missing core-flow proof; add projection tests.
- [ ] Run focused tests and observe RED.
- [ ] Implement Product QC and shallow projections.
- [ ] Run focused tests and syntax check.
- [ ] Commit `feat: verify built product against blueprint`.

### Task 6: Functional Test, publication, and Assembly Review

**Files:** Modify persistence and publication tests/contracts only as required.

**Interfaces:** One scenario runs `READY_FOR_ASSEMBLY → ASSEMBLED → Assembly QC → Build Artifact → Product QC → PRODUCT_VERIFIED → persist/reload → Workbench`.

- [ ] Add one scenario using real station modules and exact head/digest evidence.
- [ ] Run all Engine 2/3 focused tests.
- [ ] Add every new runtime module to syntax, active manifest, allowlist, and service-worker cache; test the publication contract first.
- [ ] Run `npm run deploy:gate`.
- [ ] Review behavior against Blueprint: mounted ref unchanged, source heads survive, artifact binds accepted assembly, Product QC uses exact digest, resume is exact, and no Engine 4 code exists.
- [ ] Commit `test: prove engine 3 assembly and product line`.

## Completion Boundary

Engine 3 is complete only when a sealed Engine 2 handoff becomes a source-bound artifact whose real evidence passes Product QC and restores as `PRODUCT_VERIFIED`. The next engine may scan/recover/learn from this truth; Engine 3 does not implement those responsibilities.
