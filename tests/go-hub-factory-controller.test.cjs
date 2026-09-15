"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-factory-controller.mjs")).href;

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

test("Durable Hephaestus persists one active Assembly slot and FIFO queue", async () => {
  const { HephaestusForeman } = await import(moduleUrl);
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

test("Factory controller fails closed without Durable Object binding", async () => {
  const { createFactoryControllerService } = await import(moduleUrl);
  const controller = createFactoryControllerService({ namespace: null });
  const response = await controller.getState({ repository: "pureekangraw-ops/standard-" });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: "FACTORY_FOREMAN_NOT_CONFIGURED" });
});
