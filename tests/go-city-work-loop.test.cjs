"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "../go-hub-centre.js")).href;
const load = () => import(`${moduleUrl}?go-city=${Date.now()}-${Math.random()}`);

test("GO Work Loop contract is exposed by the existing Centre boundary", async () => {
  const module = await load();
  assert.equal(typeof module.createGoWorkLoop, "function");
});

test("GO Work Loop returns capability reality to the same GO work identity", async () => {
  const { createGoWorkLoop, createTestDestinationAdapter } = await load();
  const loop = createGoWorkLoop();
  const destination = createTestDestinationAdapter((envelope) => ({
    kind: "REALITY",
    observedTask: envelope.task,
    progress: "ACTION_RETURNED",
  }));

  const entered = loop.enter({
    checkpointId: "OPTICIAN-001",
    workId: "WORK-A",
    task: "Inspect repository truth",
    requestedResult: "Return observed repository truth",
    authority: "BIG",
    lens: {
      lensId: "LENS-FIT",
      lensReference: "lens://fit",
      fittedView: "Inspect before changing",
    },
  });

  assert.equal(entered.status, "READY");

  const returned = loop.act(entered, {
    destination: "destination://factory",
    capability: destination,
  });

  assert.equal(returned.status, "RETURNED");
  assert.equal(returned.workId, "WORK-A");
  assert.equal(returned.checkpointId, "OPTICIAN-001");
  assert.deepEqual(returned.returnedPayload, {
    kind: "REALITY",
    observedTask: "Inspect repository truth",
    progress: "ACTION_RETURNED",
  });
});

test("GO Work Loop refuses action until Task, Requested Result, Authority and Lens are ready", async () => {
  const { createGoWorkLoop, createTestDestinationAdapter } = await load();
  const loop = createGoWorkLoop();
  const destination = createTestDestinationAdapter();

  const waiting = loop.enter({
    checkpointId: "OPTICIAN-001",
    workId: "WORK-A",
    task: "Inspect repository truth",
    authority: "BIG",
  });

  assert.equal(waiting.status, "WAIT");
  assert.throws(
    () => loop.act(waiting, {
      destination: "destination://factory",
      capability: destination,
    }),
    /READY/,
  );
});
