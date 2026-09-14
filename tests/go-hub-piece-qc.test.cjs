"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-piece-qc.js")).href;

async function load() {
  return import(`${moduleUrl}?qc=${Date.now()}-${Math.random()}`);
}

function fixture() {
  return {
    workPackage: { id: "wp-1", blueprintRef: "spec.md" },
    piece: { id: "piece-1", workPackageId: "wp-1", headSha: "head-1" },
    blueprint: { ref: "spec.md" },
    evidence: [
      { id: "ev-purpose", scope: "piece", claim: "purpose-correct", headSha: "head-1" },
      { id: "ev-behavior", scope: "piece", claim: "behavior-correct", headSha: "head-1" },
      { id: "ev-interface", scope: "piece", claim: "interface-correct", headSha: "head-1" },
      { id: "other", scope: "piece", claim: "purpose-correct", headSha: "head-2" },
    ],
  };
}

test("Piece QC passes with purpose, behavior, and interface evidence bound to the exact head", async () => {
  const { evaluatePieceQc } = await load();
  const input = fixture();
  const result = evaluatePieceQc(input);
  assert.equal(result.status, "pass");
  assert.equal(result.checkedHeadSha, "head-1");
  assert.deepEqual(result.checks, { purpose: true, behavior: true, interface: true, evidence: true });
  assert.deepEqual(result.evidenceIds, ["ev-purpose", "ev-behavior", "ev-interface"]);
  assert.match(result.checkedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(input.evidence.length, 4);
});

test("Piece QC fails closed for stale evidence, blueprint drift, and missing interface proof", async () => {
  const { evaluatePieceQc } = await load();
  const stale = fixture();
  stale.evidence = stale.evidence.map((item) => ({ ...item, headSha: "old-head" }));
  assert.equal(evaluatePieceQc(stale).status, "fail");

  const drift = fixture();
  drift.blueprint.ref = "changed.md";
  assert.equal(evaluatePieceQc(drift).status, "fail");

  const missing = fixture();
  missing.evidence = missing.evidence.filter((item) => item.claim !== "interface-correct");
  const result = evaluatePieceQc(missing);
  assert.equal(result.status, "fail");
  assert.equal(result.checks.interface, false);
  assert.deepEqual(result.evidenceIds, ["ev-purpose", "ev-behavior"]);
});

test("Piece QC fails closed when production identities are missing or mismatched", async () => {
  const { evaluatePieceQc } = await load();
  assert.equal(evaluatePieceQc({}).status, "fail");
  const mismatch = fixture();
  mismatch.piece.workPackageId = "wp-2";
  assert.equal(evaluatePieceQc(mismatch).status, "fail");
});
