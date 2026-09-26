"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const producerUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-ready-gate-producer.js")).href;
async function load() { return import(producerUrl + "?producer=" + Date.now() + Math.random()); }

function truth() {
  const headSha = "head-165";
  return {
    workPackage: { id: "wp-165", blueprintRef: "blueprint://factory", inputs: [], dependencies: [], assemblyTarget: "factory", version: "OWNER.19" },
    blueprint: { ref: "blueprint://factory" },
    piece: { id: "piece-165", name: "WEB-RUNTIME", workPackageId: "wp-165", repository: "pureekangraw-ops/standard-", branch: "fix/factory-ready-gate-seam", headSha, changedPaths: ["x.js"], outputs: [] },
    pieceQc: { status: "pass", checkedHeadSha: headSha, evidenceIds: ["purpose", "behavior", "interface"] },
    evidence: [
      { id: "purpose", scope: "piece", headSha, claim: "purpose-correct" },
      { id: "behavior", scope: "piece", headSha, claim: "behavior-correct" },
      { id: "interface", scope: "piece", headSha, claim: "interface-correct" },
    ],
  };
}

test("producer seals Ready Gate and routes to Assembly after exact-head Piece QC", async () => {
  const { produceReadyGate } = await load();
  const input = truth();
  const result = produceReadyGate({ ...input, ci: { headSha: input.piece.headSha, status: "success" } });
  assert.equal(result.readyGate.status, "READY_FOR_ASSEMBLY");
  assert.equal(result.readyGate.headSha, input.piece.headSha);
  assert.deepEqual(result.readyGate.completionStamp, { name: "WEB-RUNTIME", version: "OWNER.19" });
  assert.equal(result.nextAction, "request-assembly-slot");
  assert.equal(result.ci.corroboratingOnly, true);
});

test("CI PASS alone cannot mint a Ready Gate", async () => {
  const { produceReadyGate } = await load();
  const input = truth();
  assert.throws(() => produceReadyGate({
    ...input,
    pieceQc: null,
    ci: { headSha: input.piece.headSha, status: "success" },
  }), /Piece QC pass is required/);
});

test("producer rejects stale CI even when Piece QC is valid", async () => {
  const { produceReadyGate } = await load();
  const input = truth();
  assert.throws(() => produceReadyGate({
    ...input,
    ci: { headSha: "stale-head", status: "success" },
  }), /exact Piece head/);
});

test("producer works without CI when governed Piece QC truth is complete", async () => {
  const { produceReadyGate } = await load();
  const result = produceReadyGate(truth());
  assert.equal(result.readyGate.status, "READY_FOR_ASSEMBLY");
  assert.equal(result.ci, null);
});
