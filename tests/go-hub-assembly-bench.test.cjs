"use strict";
const test = require("node:test"); const assert = require("node:assert/strict");
const path = require("node:path"); const { pathToFileURL } = require("node:url");
const url = pathToFileURL(path.resolve(__dirname, "..", "go-hub-assembly-bench.js")).href;
const handoff = (id, head = `${id}-head`) => ({ status: "READY_FOR_ASSEMBLY", pieceId: id, blueprintRef: "spec.md", headSha: head, inputs: ["in"], outputs: [id], dependencies: [] });

test("assembles unique ready pieces under one mounted Blueprint", async () => {
  const { assembleReadyPieces } = await import(`${url}?${Date.now()}`);
  const result = assembleReadyPieces({ id: "a1", blueprint: { ref: "spec.md" }, handoffs: [handoff("p1"), handoff("p2")], repository: "repo", integrationBranch: "e3", integrationHeadSha: "assembly-head" });
  assert.equal(result.status, "ASSEMBLED"); assert.deepEqual(result.pieceIds, ["p1", "p2"]); assert.deepEqual(result.sourceHeads, ["p1-head", "p2-head"]); assert.equal(Object.isFrozen(result), true);
});

test("rejects non-ready, duplicate, drifted, or headless pieces", async () => {
  const { assembleReadyPieces } = await import(`${url}?${Date.now()}`);
  const base = { id: "a1", blueprint: { ref: "spec.md" }, repository: "repo", integrationBranch: "e3", integrationHeadSha: "assembly-head" };
  assert.throws(() => assembleReadyPieces({ ...base, handoffs: [{ ...handoff("p1"), status: "NO" }] }), /READY_FOR_ASSEMBLY/);
  assert.throws(() => assembleReadyPieces({ ...base, handoffs: [handoff("p1"), handoff("p1")] }), /duplicate/);
  assert.throws(() => assembleReadyPieces({ ...base, handoffs: [{ ...handoff("p1"), blueprintRef: "other" }] }), /Blueprint/);
  assert.throws(() => assembleReadyPieces({ ...base, handoffs: [handoff("p1", "")] }), /head/);
});
