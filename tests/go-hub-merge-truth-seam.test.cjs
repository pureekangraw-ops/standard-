"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const controllerUrl = pathToFileURL(path.join(root, "go-hub-factory-controller.mjs")).href;
const guardedUrl = pathToFileURL(path.join(root, "go-hub-factory-mcp-worker.mjs")).href;

function memoryContext() {
  const values = new Map();
  return { storage: { async get(key) { return values.get(key); }, async put(key, value) { values.set(key, structuredClone(value)); } } };
}

function workContext() {
  return {
    workId: "FACTORY-68", checkpointId: "FACTORY-68", returnAddress: "FACTORY-68",
    destination: "destination://factory", task: "seal merge truth", requestedResult: "one merge authority",
    lensReference: "factory://global-sequence-authority",
  };
}

function mergeRequest() {
  return {
    repository: "pureekangraw-ops/standard-", slot: "merge", goId: "go-a", jobId: "job-merge",
    assembly: { id: "assembly-1", status: "ASSEMBLED", integrationHeadSha: "assembly-head" },
    assemblyQc: { status: "pass", checkedHeadSha: "assembly-head" },
    pullRequest: { number: 68, headSha: "assembly-head" },
    ci: { status: "success", headSha: "assembly-head" },
    risk: { status: "SAFE", reasons: [] },
    workContext: workContext(),
  };
}

test("Hephaestus retains exact merge admission truth on the active job", async () => {
  const { HephaestusForeman } = await import(`${controllerUrl}?admission=${Date.now()}`);
  const foreman = new HephaestusForeman(memoryContext(), {});
  const admitted = await foreman.requestSlot(mergeRequest());
  assert.equal(admitted.outcome.status, "ACTIVE");
  const active = (await foreman.getState()).repositories["pureekangraw-ops/standard-"].merge.active;
  assert.deepEqual(active.mergeAdmission, {
    assemblyId: "assembly-1",
    sourceHeadSha: "assembly-head",
    pullRequestNumber: 68,
    pullRequestHeadSha: "assembly-head",
    ciHeadSha: "assembly-head",
    ciStatus: "success",
  });
});

test("guarded GitHub merge seals the actual merge result back into Factory ownership", async () => {
  const { createFactoryGuardedLifecycle } = await import(`${guardedUrl}?guard=${Date.now()}`);
  let recorded = null;
  const lifecycle = {
    async mergePullRequest() {
      return new Response(JSON.stringify({ merged: true, mergeSha: "main-1", headSha: "assembly-head" }), { headers: { "content-type": "application/json" } });
    },
  };
  const factory = {
    async assertActiveMerge() {
      return new Response(JSON.stringify({ active: true }), { headers: { "content-type": "application/json" } });
    },
    async recordMergeResult(input) {
      recorded = structuredClone(input);
      return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
    },
    async foreman() { return new Response("{}", { headers: { "content-type": "application/json" } }); },
  };
  const guarded = createFactoryGuardedLifecycle({ lifecycle, factory });
  const input = {
    repository: "pureekangraw-ops/standard-", number: 68, expectedHeadSha: "assembly-head",
    goId: "go-a", jobId: "job-merge", workContext: workContext(), method: "squash",
  };
  const response = await guarded.mergePullRequest(input);
  assert.equal(response.ok, true);
  assert.deepEqual(recorded, {
    repository: input.repository,
    goId: input.goId,
    jobId: input.jobId,
    workContext: input.workContext,
    pullRequestNumber: 68,
    headSha: "assembly-head",
    mergeSha: "main-1",
  });
});

test("merge slot cannot release before the guarded merge result is sealed", async () => {
  const { HephaestusForeman } = await import(`${controllerUrl}?release-before=${Date.now()}`);
  const foreman = new HephaestusForeman(memoryContext(), {});
  await foreman.requestSlot(mergeRequest());
  await assert.rejects(() => foreman.releaseSlot({
    repository: "pureekangraw-ops/standard-", slot: "merge", goId: "go-a", jobId: "job-merge",
    workContext: workContext(),
    postMergeVerification: { status: "pass", mainSha: "main-1", checkedAt: "now" },
  }), /merge result/i);
});

test("merge release returns one gate packet bound admission -> merge result -> verified main", async () => {
  const { HephaestusForeman } = await import(`${controllerUrl}?release=${Date.now()}`);
  const foreman = new HephaestusForeman(memoryContext(), {});
  await foreman.requestSlot(mergeRequest());
  await foreman.recordMergeResult({
    repository: "pureekangraw-ops/standard-", goId: "go-a", jobId: "job-merge", workContext: workContext(),
    pullRequestNumber: 68, headSha: "assembly-head", mergeSha: "main-1",
  });
  const completed = await foreman.releaseSlot({
    repository: "pureekangraw-ops/standard-", slot: "merge", goId: "go-a", jobId: "job-merge", workContext: workContext(),
    postMergeVerification: { status: "pass", mainSha: "main-1", checkedAt: "now" },
  });
  assert.deepEqual(completed.returnPacket.mergeGate, {
    status: "MERGED_VERIFIED",
    assemblyId: "assembly-1",
    sourceHeadSha: "assembly-head",
    pullRequest: { number: 68, headSha: "assembly-head" },
    ci: { status: "success", headSha: "assembly-head" },
    merge: { headSha: "assembly-head", mergeSha: "main-1", pullRequestNumber: 68 },
    postMergeVerification: { status: "pass", mainSha: "main-1", checkedAt: "now" },
  });
  assert.equal(completed.returnPacket.mainSha, "main-1");
});
