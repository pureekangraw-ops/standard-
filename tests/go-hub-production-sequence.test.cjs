"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const taskUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-code-task.js")).href;
async function load() { return import(`${taskUrl}?production-sequence=${Date.now()}-${Math.random()}`); }
function workPackage() {
  return { id: "wp-1", title: "Factory change", purpose: "prove causal production", blueprintRef: "spec.md", inputs: [], expectedOutputs: ["piece"], dependencies: [], assemblyTarget: "assembly" };
}

function start(createCodeTask) {
  return createCodeTask({ id: "production-sequence", repository: "repo" })
    .setWorkbenchTruth({ blueprint: { ref: "spec.md", status: "approved" } })
    .setWorkPackage(workPackage());
}

test("Production starts at Inspect Reality and cannot write early", async () => {
  const { createCodeTask } = await load();
  const task = start(createCodeTask);
  assert.equal(task.factoryStage, "PRODUCTION");
  assert.equal(task.productionPhase, "INSPECT_REALITY");
  assert.equal(task.nextAction, "inspect-reality");
  assert.throws(() => task.recordPiece({
    id: "piece-1", workPackageId: "wp-1", repository: "repo", branch: "work", headSha: "head-1",
  }), /Production sequence requires WRITE/);
});

test("Production enforces Inspect -> Baseline -> Trace -> Plan -> Write -> Local Verify before Piece QC", async () => {
  const { createCodeTask } = await load();
  let task = start(createCodeTask);
  task = task.recordProductionStep({ step: "INSPECT_REALITY", evidence: { repository: "repo", headSha: "base-1" } });
  assert.equal(task.productionPhase, "BASELINE");
  assert.equal(task.nextAction, "capture-baseline");
  task = task.recordProductionStep({ step: "BASELINE", evidence: { baseSha: "base-1" } });
  assert.equal(task.productionPhase, "TRACE");
  task = task.recordProductionStep({ step: "TRACE", evidence: { summary: "trace call path before edit" } });
  assert.equal(task.productionPhase, "PLAN");
  task = task.recordProductionStep({ step: "PLAN", evidence: { blueprintRef: "spec.md", planRef: "plan://wp-1" } });
  assert.equal(task.productionPhase, "WRITE");
  assert.equal(task.nextAction, "write");
  task = task.recordPiece({ id: "piece-1", workPackageId: "wp-1", repository: "repo", branch: "work", headSha: "head-2", changedPaths: ["a.js"] });
  assert.equal(task.productionPhase, "LOCAL_VERIFY");
  assert.equal(task.nextAction, "local-verify");
  assert.throws(() => task.recordPieceQc({ status: "pass", checkedHeadSha: "head-2", checks: {}, evidenceIds: [], checkedAt: "now" }), /Local Verify/);
  task = task.recordProductionStep({ step: "LOCAL_VERIFY", evidence: { status: "pass", headSha: "head-2", checks: { test: "pass" } } });
  assert.equal(task.productionPhase, "PIECE_READY");
  assert.equal(task.nextAction, "piece-qc");
  task = task.recordPieceQc({ status: "pass", checkedHeadSha: "head-2", checks: {}, evidenceIds: [], checkedAt: "now" });
  assert.equal(task.factoryStage, "PIECE_QC");
});

test("Production rejects out-of-order checkpoints and stale Local Verify heads", async () => {
  const { createCodeTask } = await load();
  let task = start(createCodeTask);
  assert.throws(() => task.recordProductionStep({ step: "TRACE", evidence: { summary: "skip" } }), /expected INSPECT_REALITY/);
  task = task.recordProductionStep({ step: "INSPECT_REALITY", evidence: { repository: "repo", headSha: "base-1" } })
    .recordProductionStep({ step: "BASELINE", evidence: { baseSha: "base-1" } })
    .recordProductionStep({ step: "TRACE", evidence: { summary: "trace" } })
    .recordProductionStep({ step: "PLAN", evidence: { blueprintRef: "spec.md", planRef: "plan://wp-1" } })
    .recordPiece({ id: "piece-1", workPackageId: "wp-1", repository: "repo", branch: "work", headSha: "head-2" });
  assert.throws(() => task.recordProductionStep({ step: "LOCAL_VERIFY", evidence: { status: "pass", headSha: "stale", checks: {} } }), /active Piece head/);
});
