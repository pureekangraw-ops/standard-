"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "../go-hub-hephaestus.js")).href;
const load = () => import(`${moduleUrl}?${Date.now()}-${Math.random()}`);
const admit = Object.freeze({ decision: "ADMIT", reasons: [] });

function request(overrides = {}) {
  return {
    repository: "pureekangraw-ops/standard-",
    slot: "assembly",
    goId: "go-a",
    jobId: "job-a",
    admission: admit,
    ...overrides,
  };
}

test("Hephaestus gives one GO the repo slot and queues the next GO", async () => {
  const { createHephaestusState, requestFactorySlot } = await load();
  const initial = createHephaestusState();
  const first = requestFactorySlot(initial, request());
  assert.equal(first.outcome.status, "ACTIVE");
  const second = requestFactorySlot(first.state, request({ goId: "go-b", jobId: "job-b" }));
  assert.equal(second.outcome.status, "QUEUED");
  assert.equal(second.outcome.position, 1);
  assert.equal(second.state.repositories["pureekangraw-ops/standard-"].assembly.active.jobId, "job-a");
});

test("different repositories have independent Assembly slots", async () => {
  const { createHephaestusState, requestFactorySlot } = await load();
  let state = createHephaestusState();
  const a = requestFactorySlot(state, request());
  state = a.state;
  const b = requestFactorySlot(state, request({ repository: "pureekangraw-ops/other", goId: "go-b", jobId: "job-b" }));
  assert.equal(b.outcome.status, "ACTIVE");
});

test("one GO cannot actively own two Hephaestus slots", async () => {
  const { createHephaestusState, requestFactorySlot } = await load();
  const first = requestFactorySlot(createHephaestusState(), request());
  const second = requestFactorySlot(first.state, request({ slot: "merge", jobId: "job-merge" }));
  assert.equal(second.outcome.status, "WAIT");
  assert.equal(second.outcome.reason, "GO_ALREADY_ACTIVE");
});

test("new build without approved Blueprint is sent back to planning", async () => {
  const { screenFactoryIntent } = await load();
  assert.deepEqual(screenFactoryIntent({ kind: "create", blueprint: null }), {
    decision: "RETURN_FOR_PLAN",
    destination: "optician",
    reason: "APPROVED_BLUEPRINT_REQUIRED",
  });
  assert.equal(screenFactoryIntent({ kind: "create", blueprint: { approved: true } }).decision, "PROCEED");
});
