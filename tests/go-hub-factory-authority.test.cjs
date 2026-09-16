"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const taskUrl = pathToFileURL(path.join(root, "go-hub-code-task.js")).href;

async function loadTask() {
  return import(`${taskUrl}?authority=${Date.now()}-${Math.random()}`);
}

function startProduction(createCodeTask) {
  return createCodeTask({ id: "authority-1", repository: "pureekangraw-ops/standard-" })
    .setWorkbenchTruth({ blueprint: { ref: "spec.md" } })
    .setWorkPackage({
      id: "wp-1", title: "Authority repair", purpose: "one effective factory authority",
      blueprintRef: "spec.md", inputs: [], expectedOutputs: [], dependencies: [], assemblyTarget: "factory",
    });
}

test("factory truth derives next action instead of inheriting legacy lifecycle action", async () => {
  const { createCodeTask } = await loadTask();
  let task = startProduction(createCodeTask);
  assert.equal(task.factoryStage, "PRODUCTION");
  assert.equal(task.nextAction, "record-piece");

  task = task.recordPiece({
    id: "piece-1", workPackageId: "wp-1", repository: "repo", branch: "branch", headSha: "piece-head",
  });
  assert.equal(task.nextAction, "piece-qc");

  task = task.addEvidence({ id: "piece-ev", scope: "piece", claim: "piece-correct", kind: "test", headSha: "piece-head" })
    .recordPieceQc({ status: "pass", checkedHeadSha: "piece-head", checks: {}, evidenceIds: ["piece-ev"], checkedAt: "now" });
  assert.equal(task.factoryStage, "PIECE_QC");
  assert.equal(task.nextAction, "ready-gate");

  task = task.recordGateHandoff({
    status: "READY_FOR_ASSEMBLY", pieceId: "piece-1", workPackageId: "wp-1",
    blueprintRef: "spec.md", headSha: "piece-head", evidenceIds: ["piece-ev"],
  });
  assert.equal(task.factoryStage, "READY_GATE");
  assert.equal(task.nextAction, "assemble");
});

test("failed factory gates derive repair actions", async () => {
  const { createCodeTask } = await loadTask();
  let task = startProduction(createCodeTask)
    .recordPiece({ id: "piece-1", workPackageId: "wp-1", repository: "repo", branch: "branch", headSha: "piece-head" })
    .recordPieceQc({ status: "fail", checkedHeadSha: "piece-head", checks: {}, evidenceIds: [], checkedAt: "now" });
  assert.equal(task.nextAction, "fix-piece");
});
