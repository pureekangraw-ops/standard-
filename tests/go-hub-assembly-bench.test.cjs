"use strict";
const test = require("node:test"); const assert = require("node:assert/strict");
const path = require("node:path"); const { pathToFileURL } = require("node:url");
const url = pathToFileURL(path.resolve(__dirname, "..", "go-hub-assembly-bench.js")).href;
const handoff = (id, head = `${id}-head`, version = "OWNER.19") => ({ status: "READY_FOR_ASSEMBLY", pieceId: id, blueprintRef: "spec.md", headSha: head, completionStamp: { name: id, version }, inputs: ["in"], outputs: [id], dependencies: [] });

test("assembles unique ready pieces under one mounted Blueprint", async () => {
  const { assembleReadyPieces } = await import(`${url}?${Date.now()}`);
  const result = assembleReadyPieces({ id: "a1", blueprint: { ref: "spec.md" }, handoffs: [handoff("p1"), handoff("p2")], repository: "repo", integrationBranch: "e3", integrationHeadSha: "assembly-head" });
  assert.equal(result.status, "ASSEMBLED"); assert.deepEqual(result.pieceIds, ["p1", "p2"]); assert.equal(result.version, "OWNER.19"); assert.deepEqual(result.completionStamps, [{ name: "p1", version: "OWNER.19" }, { name: "p2", version: "OWNER.19" }]); assert.deepEqual(result.sourceHeads, ["p1-head", "p2-head"]); assert.equal(Object.isFrozen(result), true);
});

test("rejects non-ready, duplicate, drifted, or headless pieces", async () => {
  const { assembleReadyPieces } = await import(`${url}?${Date.now()}`);
  const base = { id: "a1", blueprint: { ref: "spec.md" }, repository: "repo", integrationBranch: "e3", integrationHeadSha: "assembly-head" };
  assert.throws(() => assembleReadyPieces({ ...base, handoffs: [{ ...handoff("p1"), status: "NO" }] }), /READY_FOR_ASSEMBLY/);
  assert.throws(() => assembleReadyPieces({ ...base, handoffs: [handoff("p1"), handoff("p1")] }), /duplicate/);
  assert.throws(() => assembleReadyPieces({ ...base, handoffs: [{ ...handoff("p1"), blueprintRef: "other" }] }), /Blueprint/);
  assert.throws(() => assembleReadyPieces({ ...base, handoffs: [handoff("p1", "")] }), /head/);
});


test("rejects unstamped pieces or mixed completion versions", async () => {
  const { assembleReadyPieces } = await import(`${url}?stamp-${Date.now()}`);
  const base = { id: "a1", blueprint: { ref: "spec.md" }, repository: "repo", integrationBranch: "e3", integrationHeadSha: "assembly-head" };
  const unstamped = handoff("p1"); delete unstamped.completionStamp;
  assert.throws(() => assembleReadyPieces({ ...base, handoffs: [unstamped] }), /completion stamp is required/);
  assert.throws(() => assembleReadyPieces({ ...base, handoffs: [handoff("p1"), handoff("p2", "p2-head", "OWNER.18")] }), /version mismatch/);
});

test("mounted Blueprint version can pin the assembly version", async () => {
  const { assembleReadyPieces } = await import(`${url}?blueprint-version-${Date.now()}`);
  const base = { id: "a1", blueprint: { ref: "spec.md", version: "OWNER.19" }, repository: "repo", integrationBranch: "e3", integrationHeadSha: "assembly-head" };
  assert.equal(assembleReadyPieces({ ...base, handoffs: [handoff("p1")] }).version, "OWNER.19");
  assert.throws(() => assembleReadyPieces({ ...base, handoffs: [handoff("p1", "p1-head", "OWNER.18")] }), /mounted Blueprint/);
});
