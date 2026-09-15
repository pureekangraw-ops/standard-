"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const coreUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-factory-state-core.mjs")).href;

function storageFixture() {
  const values = new Map();
  return {
    async get(key) { return structuredClone(values.get(key)); },
    async put(entries) {
      for (const [key, value] of Object.entries(entries)) values.set(key, structuredClone(value));
    },
  };
}

test("Factory state serializes one revisioned task authority", async () => {
  const { createFactoryStatePort } = await import(coreUrl + "?state=" + Date.now());
  const port = createFactoryStatePort({ storage: storageFixture() });
  assert.equal(await port.load(), null);

  const first = await port.save({
    expectedRevision: 0,
    task: { id: "task-1", state: "INSPECTING" },
    receipt: { id: "r-1", action: "inspect", status: "success" },
    auditEvent: { event: "FACTORY_ACTION", receiptId: "r-1" },
  });
  assert.equal(first.revision, 1);
  assert.equal((await port.load()).task.id, "task-1");

  await assert.rejects(port.save({
    expectedRevision: 0,
    task: { id: "task-1", state: "BRANCH_READY" },
    receipt: { id: "r-2" },
    auditEvent: { event: "FACTORY_ACTION" },
  }), /STALE_TASK_REVISION/);
});

test("Factory state rejects secret-bearing snapshots", async () => {
  const { createFactoryStatePort } = await import(coreUrl + "?secret=" + Date.now());
  const port = createFactoryStatePort({ storage: storageFixture() });
  await assert.rejects(port.save({
    expectedRevision: 0,
    task: { id: "task-1", token: "nope" },
    receipt: { id: "r-1" },
    auditEvent: { event: "FACTORY_ACTION" },
  }), /SECRET_FIELD_REJECTED/);
});
