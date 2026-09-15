"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const receiptUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-reality-receipt.mjs")).href;
const repository = "pureekangraw-ops/standard-";

test("Reality receipt is deeply immutable and rejects secret fields", async () => {
  const { createRealityReceipt } = await import(receiptUrl + "?receipt=" + Date.now());
  const receipt = createRealityReceipt({
    id: "r-1",
    action: "inspect",
    status: "success",
    repository,
    observedAt: "2026-09-15T00:00:00.000Z",
    source: "github",
    identity: { baseSha: "base", headSha: "head" },
    result: { branch: "main" },
    evidence: { treeCount: 3 },
  });
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.identity), true);
  assert.throws(() => createRealityReceipt({
    id: "r-2",
    action: "inspect",
    status: "success",
    repository,
    observedAt: "now",
    source: "github",
    evidence: { authorization: "Bearer x" },
  }), /SECRET_FIELD_REJECTED/);
});
