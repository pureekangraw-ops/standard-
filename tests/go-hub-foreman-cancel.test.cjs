"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const controllerUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-factory-controller.mjs")).href;

function memoryContext() {
  const values = new Map();
  return { storage: { async get(key) { return values.get(key); }, async put(key, value) { values.set(key, structuredClone(value)); } } };
}

function mergeRequest(overrides = {}) {
  return {
    repository: "pureekangraw-ops/standard-", slot: "merge", goId: "go-old", jobId: "job-pr-69",
    assembly: { id: "assembly-69", status: "ASSEMBLED", integrationHeadSha: "head-69" },
    assemblyQc: { status: "pass", checkedHeadSha: "head-69" },
    pullRequest: { number: 69, headSha: "head-69" },
    ci: { status: "success", headSha: "head-69" },
    risk: { status: "SAFE", reasons: [] },
    ...overrides,
  };
}

test("Foreman can cancel closed unmerged work without inventing post-merge verification", async () => {
  const { HephaestusForeman } = await import(controllerUrl + "?cancel=" + Date.now());
  const foreman = new HephaestusForeman(memoryContext(), {});
  const admitted = await foreman.requestSlot(mergeRequest());
  assert.equal(admitted.outcome.status, "ACTIVE");

  const cancelled = await foreman.cancelWork({
    repository: "pureekangraw-ops/standard-",
    slot: "merge",
    goId: "go-old",
    jobId: "job-pr-69",
    cancellation: {
      reason: "PULL_REQUEST_CLOSED_UNMERGED",
      observedAt: "2026-09-17T13:00:00Z",
      pullRequest: { number: 69, state: "closed", merged: false, headSha: "head-69" },
    },
  });
  assert.equal(cancelled.outcome.status, "CANCELLED");
  assert.equal(cancelled.outcome.reason, "PULL_REQUEST_CLOSED_UNMERGED");
  assert.equal(cancelled.state.repositories["pureekangraw-ops/standard-"].merge.active, null);
});

test("Foreman refuses cancellation evidence that does not prove closed unmerged PR", async () => {
  const { HephaestusForeman } = await import(controllerUrl + "?cancel-invalid=" + Date.now());
  const foreman = new HephaestusForeman(memoryContext(), {});
  await foreman.requestSlot(mergeRequest());
  await assert.rejects(() => foreman.cancelWork({
    repository: "pureekangraw-ops/standard-", slot: "merge", goId: "go-old", jobId: "job-pr-69",
    cancellation: { reason: "PULL_REQUEST_CLOSED_UNMERGED", observedAt: "2026-09-17T13:00:00Z", pullRequest: { number: 69, state: "open", merged: false, headSha: "head-69" } },
  }), /closed unmerged pull request/i);
});
