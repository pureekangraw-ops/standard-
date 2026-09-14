"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "../go-hub-centre.js")).href;
const load = () => import(`${moduleUrl}?${Date.now()}-${Math.random()}`);

test("Centre creates one stable checkpoint identity", async () => {
  const { createCheckpoint, CENTRE_STATES } = await load();
  const work = createCheckpoint({
    checkpointId: "CENTRE-001",
    workId: "WORK-A",
    createdAt: "2026-09-14T15:00:00.000Z",
  });
  assert.equal(work.status, CENTRE_STATES.ARRIVED);
  assert.equal(work.checkpointId, "CENTRE-001");
  assert.equal(work.workId, "WORK-A");
  assert.equal(Object.isFrozen(work), true);
});

test("unclear intake waits and can resume without replacing identity", async () => {
  const { createCheckpoint, intakeTask, resumeIntake, CENTRE_STATES } = await load();
  const arrived = createCheckpoint({ checkpointId: "CENTRE-001", workId: "WORK-A" });
  const waiting = intakeTask(arrived, { task: "Task A", authority: "BIG" });
  assert.equal(waiting.status, CENTRE_STATES.WAIT);
  const ready = resumeIntake(waiting, { requestedResult: "Return verified result" });
  assert.equal(ready.status, CENTRE_STATES.READY);
  assert.equal(ready.checkpointId, arrived.checkpointId);
  assert.equal(ready.workId, arrived.workId);
});

test("Lens changes fitted view without changing task truth", async () => {
  const { createCheckpoint, intakeTask, fitLens } = await load();
  const ready = intakeTask(
    createCheckpoint({ checkpointId: "CENTRE-001", workId: "WORK-A" }),
    { task: "Task A", requestedResult: "Result A", authority: "BIG" },
  );
  const fitted = fitLens(ready, {
    lensId: "LENS-CRYSTALLIZE",
    lensReference: "lens://crystallize",
    fittedView: "Find the smallest testable truth",
  });
  assert.equal(fitted.task, "Task A");
  assert.equal(fitted.requestedResult, "Result A");
  assert.equal(fitted.lens.lensReference, "lens://crystallize");
});

test("handoff uses an abstract destination and the original checkpoint as return address", async () => {
  const { createCheckpoint, intakeTask, fitLens, createHandoff, CENTRE_STATES } = await load();
  const fitted = fitLens(
    intakeTask(
      createCheckpoint({ checkpointId: "CENTRE-001", workId: "WORK-A" }),
      { task: "Task A", requestedResult: "Result A", authority: "BIG" },
    ),
    { lensId: "LENS-1", lensReference: "lens://1", fittedView: "View A" },
  );
  const { work, envelope } = createHandoff(fitted, { destination: "destination://factory" });
  assert.equal(work.status, CENTRE_STATES.AWAY);
  assert.equal(envelope.destination, "destination://factory");
  assert.equal(envelope.returnAddress, "CENTRE-001");
  assert.equal(envelope.workId, "WORK-A");
});

test("Reality Test: Work A returns to Centre 001 and does not create Centre 002", async () => {
  const {
    createCheckpoint, intakeTask, fitLens, createHandoff,
    createTestDestinationAdapter, receiveReturn, CENTRE_STATES,
  } = await load();

  const checkpoint = createCheckpoint({
    checkpointId: "CENTRE-001",
    workId: "WORK-A",
    createdAt: "2026-09-14T15:00:00.000Z",
  });
  const ready = fitLens(
    intakeTask(checkpoint, {
      task: "Task A",
      requestedResult: "Return the same work identity",
      authority: "BIG",
    }),
    {
      lensId: "LENS-1",
      lensReference: "lens://first-fit",
      fittedView: "Track identity and return address",
    },
  );
  const sent = createHandoff(ready, { destination: "test://destination" });
  const destination = createTestDestinationAdapter(() => ({ outcome: "test-only" }));
  const returned = receiveReturn(sent.work, destination.accept(sent.envelope));

  assert.equal(returned.status, CENTRE_STATES.RETURNED);
  assert.equal(returned.workId, "WORK-A");
  assert.equal(returned.checkpointId, "CENTRE-001");
  assert.equal(returned.handoff.returnAddress, "CENTRE-001");
  assert.deepEqual(returned.returnedPayload, { outcome: "test-only" });
});

test("return receiver rejects mismatched work or checkpoint identity", async () => {
  const { createCheckpoint, intakeTask, fitLens, createHandoff, receiveReturn } = await load();
  const fitted = fitLens(
    intakeTask(
      createCheckpoint({ checkpointId: "CENTRE-001", workId: "WORK-A" }),
      { task: "Task A", requestedResult: "Result A", authority: "BIG" },
    ),
    { lensId: "LENS-1", lensReference: "lens://1", fittedView: "View A" },
  );
  const sent = createHandoff(fitted, { destination: "test://destination" });
  assert.throws(
    () => receiveReturn(sent.work, { workId: "WORK-B", checkpointId: "CENTRE-001" }),
    /Work ID/,
  );
  assert.throws(
    () => receiveReturn(sent.work, { workId: "WORK-A", checkpointId: "CENTRE-002" }),
    /Checkpoint ID/,
  );
});
