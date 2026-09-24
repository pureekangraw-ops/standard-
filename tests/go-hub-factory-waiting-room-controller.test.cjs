"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const controllerUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-factory-controller.mjs")).href;
const factoryMcpUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-factory-mcp-worker.mjs")).href;
const registryUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-mcp-registry.mjs")).href;

function memoryContext() {
  const values = new Map();
  return {
    storage: {
      async get(key) { return values.get(key); },
      async put(key, value) { values.set(key, structuredClone(value)); },
    },
  };
}

function mergeRequest(overrides = {}) {
  return {
    repository: "pureekangraw-ops/standard-",
    slot: "merge",
    goId: "go-a",
    jobId: "job-merge",
    assembly: { id: "assembly-71", status: "ASSEMBLED", integrationHeadSha: "pr-head" },
    assemblyQc: { status: "pass", checkedHeadSha: "pr-head" },
    pullRequest: { number: 71, headSha: "pr-head" },
    ci: { status: "success", headSha: "pr-head" },
    risk: { status: "SAFE", reasons: [] },
    ...overrides,
  };
}

test("Foreman parks a merged job outside the merge lane and later verifies it from the waiting room", async () => {
  const { HephaestusForeman } = await import(`${controllerUrl}?${Date.now()}`);
  const foreman = new HephaestusForeman(memoryContext(), {});
  const admitted = await foreman.requestSlot(mergeRequest());
  assert.equal(admitted.outcome.status, "ACTIVE");

  await foreman.recordMergeResult({
    repository: "pureekangraw-ops/standard-",
    goId: "go-a",
    jobId: "job-merge",
    pullRequestNumber: 71,
    headSha: "pr-head",
    mergeSha: "main-after-merge",
  });

  const parked = await foreman.parkMerged({
    repository: "pureekangraw-ops/standard-",
    goId: "go-a",
    jobId: "job-merge",
    mainSha: "main-after-merge",
    mergedAt: "2026-09-17T08:20:00+07:00",
  });
  assert.equal(parked.outcome.status, "PARKED_FOR_VERIFICATION");
  let state = await foreman.getState();
  assert.equal(state.repositories["pureekangraw-ops/standard-"].merge.active, null);
  assert.equal(state.repositories["pureekangraw-ops/standard-"].waitingRoom[0].jobId, "job-merge");

  const verified = await foreman.verifyWaitingRoom({
    repository: "pureekangraw-ops/standard-",
    goId: "go-a",
    jobId: "job-merge",
    postMergeVerification: {
      status: "pass",
      mainSha: "main-after-merge",
      checkedAt: "2026-09-17T08:22:00+07:00",
    },
  });
  assert.equal(verified.outcome.status, "VERIFIED");
  assert.equal(verified.returnPacket.destination, "optician");
  state = await foreman.getState();
  assert.deepEqual(state.repositories["pureekangraw-ops/standard-"].waitingRoom, []);
});

test("guarded merge automatically parks successful GitHub merge evidence in the waiting room", async () => {
  const { createFactoryGuardedLifecycle } = await import(`${factoryMcpUrl}?${Date.now()}`);
  const calls = [];
  const lifecycle = {
    async mergePullRequest() {
      return new Response(JSON.stringify({
        merged: true,
        mergeSha: "main-after-merge",
        headSha: "pr-head",
      }), { headers: { "content-type": "application/json" } });
    },
  };
  const factory = {
    async assertActiveMerge() {
      return new Response(JSON.stringify({ active: true }), { headers: { "content-type": "application/json" } });
    },
    async recordMergeResult() {
      return new Response(JSON.stringify({ outcome: { status: "MERGE_RECORDED" } }), {
        headers: { "content-type": "application/json" },
      });
    },
    async foreman(input) {
      calls.push(structuredClone(input));
      return new Response(JSON.stringify({ outcome: { status: "PARKED_FOR_VERIFICATION" } }), {
        headers: { "content-type": "application/json" },
      });
    },
  };
  const guarded = createFactoryGuardedLifecycle({ lifecycle, factory });
  const response = await guarded.mergePullRequest({
    repository: "pureekangraw-ops/standard-",
    number: 71,
    expectedHeadSha: "pr-head",
    goId: "go-a",
    jobId: "job-merge",
    workContext: {
      workId: "WORK-71",
      checkpointId: "CENTRE-71",
      returnAddress: "CENTRE-71",
      destination: "destination://factory",
      task: "Create verification waiting room",
      requestedResult: "Release merge lane after merge",
      lensReference: "lens://factory",
    },
  });
  assert.equal(response.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].action, "park");
  assert.equal(calls[0].mainSha, "main-after-merge");
  assert.equal(calls[0].goId, "go-a");
  assert.equal(calls[0].jobId, "job-merge");
});

test("MCP cutover keeps Foreman source compatibility but removes it from active tool publication", async () => {
  const { createMcpRegistry } = await import(`${registryUrl}?${Date.now()}`);
  const noop = async () => new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
  const registry = createMcpRegistry({ lifecycle: new Proxy({}, { get: () => noop }) });
  const tools = registry.listTools();
  assert.equal(tools.some(item => item.name === "go_hub_factory_foreman"), false);
  assert.ok(tools.some(item => item.name === "go_hub_factory_v4"));
});
