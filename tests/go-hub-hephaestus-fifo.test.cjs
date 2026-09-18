"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const coreUrl = pathToFileURL(path.join(root, "go-hub-hephaestus.js")).href;
const queueUrl = pathToFileURL(path.join(root, "go-hub-hephaestus-queue.js")).href;
const admit = Object.freeze({ decision: "ADMIT", reasons: [] });

test("new GO cannot jump a queue head that is waiting for recheck", async () => {
  const { createHephaestusState, requestFactorySlot } = await import(`${coreUrl}?${Date.now()}`);
  const { releaseFactorySlot } = await import(`${queueUrl}?${Date.now()}`);
  const base = {
    repository: "pureekangraw-ops/standard-",
    slot: "assembly",
    admission: admit,
  };

  let state = requestFactorySlot(createHephaestusState(), {
    ...base,
    goId: "go-a",
    jobId: "job-a",
  }).state;
  state = requestFactorySlot(state, {
    ...base,
    goId: "go-b",
    jobId: "job-b",
  }).state;
  state = releaseFactorySlot(state, {
    repository: base.repository,
    slot: base.slot,
    goId: "go-a",
    jobId: "job-a",
  }).state;

  const newcomer = requestFactorySlot(state, {
    ...base,
    goId: "go-c",
    jobId: "job-c",
  });

  const lane = newcomer.state.repositories[base.repository].assembly;
  assert.equal(newcomer.outcome.status, "QUEUED");
  assert.equal(newcomer.outcome.position, 2);
  assert.equal(lane.active, null);
  assert.equal(lane.queue[0].jobId, "job-b");
  assert.equal(lane.queue[0].status, "NEEDS_RECHECK");
  assert.equal(lane.queue[1].jobId, "job-c");
});

test("retiring an integrated queue head preserves FIFO and promotes the next job for recheck", async () => {
  const { createHephaestusState, requestFactorySlot } = await import(`${coreUrl}?retire-${Date.now()}`);
  const { releaseFactorySlot, retireQueuedFactoryWork } = await import(`${queueUrl}?retire-${Date.now()}`);
  const base = {
    repository: "pureekangraw-ops/standard-",
    slot: "merge",
    admission: admit,
  };

  let state = requestFactorySlot(createHephaestusState(), {
    ...base,
    goId: "go-active",
    jobId: "job-pr-81",
  }).state;
  state = requestFactorySlot(state, {
    ...base,
    goId: "go-82",
    jobId: "job-pr-82",
  }).state;
  state = requestFactorySlot(state, {
    ...base,
    goId: "go-83",
    jobId: "job-pr-83",
  }).state;
  state = releaseFactorySlot(state, {
    repository: base.repository,
    slot: base.slot,
    goId: "go-active",
    jobId: "job-pr-81",
  }).state;

  const retired = retireQueuedFactoryWork(state, {
    repository: base.repository,
    slot: base.slot,
    goId: "go-82",
    jobId: "job-pr-82",
  });

  const lane = retired.state.repositories[base.repository].merge;
  assert.equal(retired.outcome.status, "RETIRED");
  assert.equal(retired.outcome.retiredJobId, "job-pr-82");
  assert.equal(retired.outcome.promotedJobId, "job-pr-83");
  assert.equal(lane.active, null);
  assert.equal(lane.queue.length, 1);
  assert.equal(lane.queue[0].jobId, "job-pr-83");
  assert.equal(lane.queue[0].status, "NEEDS_RECHECK");
  assert.deepEqual(lane.queue[0].risk, { status: "RECHECK", reasons: ["QUEUE_ADVANCED"] });
});

test("queue retirement fails closed unless the requested job is the idle lane head", async () => {
  const { createHephaestusState, requestFactorySlot } = await import(`${coreUrl}?retire-guard-${Date.now()}`);
  const { retireQueuedFactoryWork } = await import(`${queueUrl}?retire-guard-${Date.now()}`);
  const base = {
    repository: "pureekangraw-ops/standard-",
    slot: "assembly",
    admission: admit,
  };
  let state = requestFactorySlot(createHephaestusState(), { ...base, goId: "go-active", jobId: "job-active" }).state;
  state = requestFactorySlot(state, { ...base, goId: "go-next", jobId: "job-next" }).state;

  assert.throws(() => retireQueuedFactoryWork(state, {
    repository: base.repository,
    slot: base.slot,
    goId: "go-next",
    jobId: "job-next",
  }), /slot is active/i);
});
