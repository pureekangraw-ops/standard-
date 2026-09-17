"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const notionUrl = pathToFileURL(path.join(root, "go-hub-notion-catalog.mjs")).href;
const controllerUrl = pathToFileURL(path.join(root, "go-hub-factory-controller.mjs")).href;

const factoryWorkContext = Object.freeze({
  workId: "WORK-A", checkpointId: "CENTRE-001", returnAddress: "CENTRE-001",
  destination: "destination://factory", task: "Build GO City",
  requestedResult: "Verified result", lensReference: "lens://city",
});
const mimirWorkContext = Object.freeze({ ...factoryWorkContext, destination: "destination://mimir" });

function memoryContext() {
  const values = new Map();
  return { storage: {
    async get(key) { return values.get(key); },
    async put(key, value) { values.set(key, structuredClone(value)); },
  } };
}

function mergeInput(overrides = {}) {
  return {
    repository: "pureekangraw-ops/standard-", slot: "merge", goId: "go-a", jobId: "job-merge",
    assembly: { id: "assembly-1", status: "ASSEMBLED", integrationHeadSha: "integration-head" },
    assemblyQc: { status: "pass", checkedHeadSha: "integration-head" },
    pullRequest: { number: 51, headSha: "integration-head" },
    ci: { status: "success", headSha: "integration-head" },
    risk: { status: "SAFE", reasons: [] },
    workContext: factoryWorkContext,
    ...overrides,
  };
}

test("live MIMIR catalog response preserves Centre work context even on WAIT", async () => {
  const { createNotionCatalogService } = await import(`${notionUrl}?work=${Date.now()}`);
  const service = createNotionCatalogService({
    token: "notion-secret", dataSourceId: "catalog-source-id",
    fetchImpl: async () => new Response(JSON.stringify({ results: [], has_more: false, next_cursor: null }), { headers: { "content-type": "application/json" } }),
  });
  const payload = await (await service.searchCatalog({
    task: "Find a route", requestedResult: "Return route evidence", lensReference: "lens://city", workContext: mimirWorkContext,
  })).json();
  assert.equal(payload.status, "WAIT");
  assert.deepEqual(payload.workContext, mimirWorkContext);
});

test("Hephaestus active and queued jobs retain Centre work context", async () => {
  const { HephaestusForeman } = await import(`${controllerUrl}?work=${Date.now()}`);
  const foreman = new HephaestusForeman(memoryContext(), {});
  const base = {
    repository: "pureekangraw-ops/standard-", slot: "assembly",
    readyGate: { status: "READY_FOR_ASSEMBLY", headSha: "piece-head" }, piece: { headSha: "piece-head" },
  };
  await foreman.requestSlot({ ...base, goId: "go-a", jobId: "job-a", workContext: factoryWorkContext });
  await foreman.requestSlot({ ...base, goId: "go-b", jobId: "job-b", workContext: { ...factoryWorkContext, workId: "WORK-B", checkpointId: "CENTRE-002", returnAddress: "CENTRE-002" } });
  const lane = (await foreman.getState()).repositories["pureekangraw-ops/standard-"].assembly;
  assert.deepEqual(lane.active.workContext, factoryWorkContext);
  assert.equal(lane.queue[0].workContext.workId, "WORK-B");
  assert.equal(lane.queue[0].workContext.checkpointId, "CENTRE-002");
});

test("Hephaestus merge ownership requires the same Centre work identity", async () => {
  const { HephaestusForeman } = await import(`${controllerUrl}?merge-work=${Date.now()}`);
  const foreman = new HephaestusForeman(memoryContext(), {});
  await foreman.requestSlot(mergeInput());

  assert.equal(await foreman.assertActiveMerge({
    repository: "pureekangraw-ops/standard-", goId: "go-a", jobId: "job-merge", workContext: factoryWorkContext,
  }), true);
  assert.equal(await foreman.assertActiveMerge({
    repository: "pureekangraw-ops/standard-", goId: "go-a", jobId: "job-merge",
    workContext: { ...factoryWorkContext, workId: "WORK-B" },
  }), false);
});
