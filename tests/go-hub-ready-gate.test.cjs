"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-ready-gate.js")).href;
async function load() { return import(`${moduleUrl}?gate=${Date.now()}-${Math.random()}`); }

function fixture() {
  return {
    workPackage: {
      id: "wp-1", blueprintRef: "spec.md", inputs: ["truth"], expectedOutputs: ["sealed piece"],
      dependencies: ["Engine 1"], assemblyTarget: "Engine 2 line", version: "OWNER.19",
    },
    piece: {
      id: "piece-1", name: "RIDE-MAP", workPackageId: "wp-1", repository: "pureekangraw-ops/standard-",
      branch: "engine-2", headSha: "head-1", changedPaths: ["piece.js"], outputs: ["sealed piece"],
    },
    blueprint: { ref: "spec.md" },
    pieceQc: {
      status: "pass", checkedHeadSha: "head-1",
      checks: { purpose: true, behavior: true, interface: true, evidence: true },
      evidenceIds: ["ev-purpose", "ev-behavior", "ev-interface"], checkedAt: "2026-09-14T12:00:00.000Z",
    },
    evidence: ["ev-purpose", "ev-behavior", "ev-interface"].map((id) => ({
      id, scope: "piece", headSha: "head-1",
    })),
    knownLimitations: ["single work package only"],
  };
}

test("Ready Gate seals an immutable, complete, exact-head handoff", async () => {
  const { sealReadyGate } = await load();
  const input = fixture();
  const handoff = sealReadyGate(input);
  assert.equal(handoff.status, "READY_FOR_ASSEMBLY");
  assert.equal(handoff.pieceId, "piece-1");
  assert.equal(handoff.workPackageId, "wp-1");
  assert.deepEqual(handoff.completionStamp, { name: "RIDE-MAP", version: "OWNER.19" });
  assert.deepEqual(Object.keys(handoff.completionStamp).sort(), ["name", "version"]);
  assert.equal(handoff.blueprintRef, "spec.md");
  assert.equal(handoff.repository, "pureekangraw-ops/standard-");
  assert.equal(handoff.branch, "engine-2");
  assert.equal(handoff.headSha, "head-1");
  assert.deepEqual(handoff.changedPaths, ["piece.js"]);
  assert.deepEqual(handoff.evidenceIds, ["ev-purpose", "ev-behavior", "ev-interface"]);
  assert.equal(Object.isFrozen(handoff), true);
  input.piece.changedPaths.push("drift.js");
  assert.deepEqual(handoff.changedPaths, ["piece.js"]);
});

test("Ready Gate rejects QC failure and any head change after QC", async () => {
  const { sealReadyGate } = await load();
  const failed = fixture();
  failed.pieceQc.status = "fail";
  assert.throws(() => sealReadyGate(failed), /Piece QC pass/);
  const changed = fixture();
  changed.piece.headSha = "head-2";
  assert.throws(() => sealReadyGate(changed), /checked head/);
});

test("Ready Gate rejects missing QC evidence and Blueprint drift", async () => {
  const { sealReadyGate } = await load();
  const missing = fixture();
  missing.evidence.pop();
  assert.throws(() => sealReadyGate(missing), /QC evidence/);
  const drift = fixture();
  drift.blueprint.ref = "changed.md";
  assert.throws(() => sealReadyGate(drift), /mounted Blueprint/);
});


test("Ready Gate refuses to stamp a finished piece when the planned version is missing", async () => {
  const { sealReadyGate } = await load();
  const input = fixture();
  delete input.workPackage.version;
  assert.throws(() => sealReadyGate(input), /Work Package version is required/);
});
