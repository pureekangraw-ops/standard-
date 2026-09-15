"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const controllerUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-factory-controller.mjs")).href;
const factoryMcpUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-factory-mcp-worker.mjs")).href;

function memoryContext() {
  const values = new Map();
  return {
    storage: {
      async get(key) { return values.get(key); },
      async put(key, value) { values.set(key, structuredClone(value)); },
    },
  };
}

function assemblyRequest(overrides = {}) {
  return {
    repository: "pureekangraw-ops/standard-",
    slot: "assembly",
    goId: "go-a",
    jobId: "job-a",
    readyGate: { status: "READY_FOR_ASSEMBLY", headSha: "piece-head" },
    piece: { headSha: "piece-head" },
    ...overrides,
  };
}

function mergeRequest(overrides = {}) {
  return {
    repository: "pureekangraw-ops/standard-",
    slot: "merge",
    goId: "go-a",
    jobId: "job-merge",
    assembly: { status: "ASSEMBLED", integrationHeadSha: "integration-head" },
    assemblyQc: { status: "pass", checkedHeadSha: "integration-head" },
    pullRequest: { number: 50, headSha: "pr-head" },
    ci: { status: "success", headSha: "pr-head" },
    risk: { status: "SAFE", reasons: [] },
    ...overrides,
  };
}

test("Durable Hephaestus persists one active Assembly slot and FIFO queue", async () => {
  const { HephaestusForeman } = await import(controllerUrl);
  const foreman = new HephaestusForeman(memoryContext(), {});
  const first = await foreman.requestSlot(assemblyRequest());
  assert.equal(first.outcome.status, "ACTIVE");
  const second = await foreman.requestSlot(assemblyRequest({ goId: "go-b", jobId: "job-b" }));
  assert.equal(second.outcome.status, "QUEUED");
  const state = await foreman.getState();
  const lane = state.repositories["pureekangraw-ops/standard-"].assembly;
  assert.equal(lane.active.jobId, "job-a");
  assert.equal(lane.queue[0].jobId, "job-b");
});

test("Factory uses one global Hephaestus state so a GO cannot own slots across repositories", async () => {
  const { HephaestusForeman, createFactoryControllerService } = await import(controllerUrl);
  const instances = new Map();
  const namespace = {
    getByName(name) {
      if (!instances.has(name)) {
        const foreman = new HephaestusForeman(memoryContext(), {});
        instances.set(name, { fetch: request => foreman.fetch(request) });
      }
      return instances.get(name);
    },
  };
  const controller = createFactoryControllerService({ namespace });

  const firstResponse = await controller.foreman({ action: "request", ...assemblyRequest() });
  const first = await firstResponse.json();
  assert.equal(first.outcome.status, "ACTIVE");

  const secondResponse = await controller.foreman({
    action: "request",
    ...assemblyRequest({
      repository: "pureekangraw-ops/other",
      jobId: "job-other",
    }),
  });
  const second = await secondResponse.json();
  assert.equal(second.outcome.status, "WAIT");
  assert.equal(second.outcome.reason, "GO_ALREADY_ACTIVE");
  assert.deepEqual([...instances.keys()], ["factory"]);
});

test("server-side admission refuses stale Assembly evidence", async () => {
  const { HephaestusForeman } = await import(controllerUrl);
  const foreman = new HephaestusForeman(memoryContext(), {});
  const result = await foreman.requestSlot(assemblyRequest({
    readyGate: { status: "READY_FOR_ASSEMBLY", headSha: "old-head" },
  }));
  assert.equal(result.outcome.status, "WAIT");
  assert.equal(result.outcome.reason, "READY_GATE_STALE_HEAD");
});

test("Merge stays owned through Verify and exits through Hephaestus to Optician", async () => {
  const { HephaestusForeman } = await import(controllerUrl);
  const foreman = new HephaestusForeman(memoryContext(), {});
  const admitted = await foreman.requestSlot(mergeRequest());
  assert.equal(admitted.outcome.status, "ACTIVE");
  assert.equal(await foreman.assertActiveMerge({ repository: "pureekangraw-ops/standard-", goId: "go-a", jobId: "job-merge" }), true);

  await assert.rejects(
    foreman.releaseSlot({ repository: "pureekangraw-ops/standard-", slot: "merge", goId: "go-a", jobId: "job-merge" }),
    /post-merge verification/i,
  );

  const completed = await foreman.releaseSlot({
    repository: "pureekangraw-ops/standard-",
    slot: "merge",
    goId: "go-a",
    jobId: "job-merge",
    postMergeVerification: { status: "pass", mainSha: "main-after-merge", checkedAt: "2026-09-15T23:59:00+07:00" },
  });
  assert.equal(completed.returnPacket.destination, "optician");
  assert.equal(completed.returnPacket.reason, "FACTORY_REALITY_CHANGED");
});

test("Factory controller fails closed without Durable Object binding", async () => {
  const { createFactoryControllerService } = await import(controllerUrl);
  const controller = createFactoryControllerService({ namespace: null });
  const response = await controller.getState({ repository: "pureekangraw-ops/standard-" });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: "FACTORY_FOREMAN_NOT_CONFIGURED" });
});

test("guarded MCP lifecycle rejects merge before GitHub when Hephaestus slot is not owned", async () => {
  const { createFactoryGuardedLifecycle } = await import(factoryMcpUrl + "?guard=" + Date.now());
  let mergeCalls = 0;
  const lifecycle = {
    async mergePullRequest() {
      mergeCalls += 1;
      return new Response(JSON.stringify({ merged: true }), { headers: { "content-type": "application/json" } });
    },
  };
  const factory = {
    async assertActiveMerge() {
      return new Response(JSON.stringify({ active: false }), { headers: { "content-type": "application/json" } });
    },
    async foreman() {
      return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
    },
  };
  const guarded = createFactoryGuardedLifecycle({ lifecycle, factory });
  const response = await guarded.mergePullRequest({
    repository: "pureekangraw-ops/standard-",
    number: 50,
    expectedHeadSha: "head-sha",
    goId: "go-a",
    jobId: "job-a",
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { code: "FACTORY_MERGE_SLOT_REQUIRED" });
  assert.equal(mergeCalls, 0);
});
