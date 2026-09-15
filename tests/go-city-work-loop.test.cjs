"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const centreUrl = pathToFileURL(path.resolve(__dirname, "../go-hub-centre.js")).href;
const mimirUrl = pathToFileURL(path.resolve(__dirname, "../go-hub-mimir-destination.js")).href;
const loadCentre = () => import(`${centreUrl}?go-city=${Date.now()}-${Math.random()}`);

test("GO Work Loop contract is exposed by the existing Centre boundary", async () => {
  const module = await loadCentre();
  assert.equal(typeof module.createGoWorkLoop, "function");
});

test("GO Work Loop returns capability reality to the same GO work identity", async () => {
  const { createGoWorkLoop, createTestDestinationAdapter } = await loadCentre();
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
    lens: { lensId: "LENS-FIT", lensReference: "lens://fit", fittedView: "Inspect before changing" },
  });
  assert.equal(entered.status, "READY");
  const returned = loop.act(entered, { destination: "destination://factory", capability: destination });
  assert.equal(returned.status, "RETURNED");
  assert.equal(returned.workId, "WORK-A");
  assert.equal(returned.checkpointId, "OPTICIAN-001");
  assert.equal(returned.returnedPayload.progress, "ACTION_RETURNED");
});

test("GO Work Loop refuses action until Task, Requested Result, Authority and Lens are ready", async () => {
  const { createGoWorkLoop, createTestDestinationAdapter } = await loadCentre();
  const loop = createGoWorkLoop();
  const waiting = loop.enter({ checkpointId: "OPTICIAN-001", workId: "WORK-A", task: "Inspect repository truth", authority: "BIG" });
  assert.equal(waiting.status, "WAIT");
  assert.throws(() => loop.act(waiting, { destination: "destination://factory", capability: createTestDestinationAdapter() }), /READY/);
});

test("MIMIR PASS travels through the same GO Work Loop and returns route to GO", async () => {
  const nonce = `${Date.now()}-${Math.random()}`;
  const { createGoWorkLoop } = await import(`${centreUrl}?mimir-loop=${nonce}`);
  const { createMimirSearchDestination, MIMIR_DESTINATION } = await import(`${mimirUrl}?mimir-loop=${nonce}`);
  const loop = createGoWorkLoop();
  const mimir = createMimirSearchDestination({
    async search() {
      return { status: "PASS", records: [{ name: "Factory" }], route: "GO -> Factory", evidence: { verified: true } };
    },
  });
  const entered = loop.enter({
    checkpointId: "OPTICIAN-001", workId: "WORK-MIMIR", task: "Find build capability",
    requestedResult: "Return a verified route", authority: "BIG",
    lens: { lensId: "LENS-SEARCH", lensReference: "lens://search", fittedView: "Find before inventing" },
  });
  const returned = await loop.act(entered, { destination: MIMIR_DESTINATION, capability: mimir });
  assert.equal(returned.status, "RETURNED");
  assert.equal(returned.returnedPayload.status, "PASS");
  assert.equal(returned.returnedPayload.next, "GO_DECIDE");
  assert.equal(returned.returnedPayload.route, "GO -> Factory");
});

test("MIMIR WAIT returns to GO review instead of becoming an action", async () => {
  const nonce = `${Date.now()}-${Math.random()}`;
  const { createGoWorkLoop } = await import(`${centreUrl}?mimir-wait=${nonce}`);
  const { createMimirSearchDestination, MIMIR_DESTINATION } = await import(`${mimirUrl}?mimir-wait=${nonce}`);
  const loop = createGoWorkLoop();
  const mimir = createMimirSearchDestination({ async search() { return { status: "WAIT", waitReason: "NO_MATCH", records: [], route: null }; } });
  const entered = loop.enter({
    checkpointId: "OPTICIAN-001", workId: "WORK-MIMIR", task: "Find unknown capability",
    requestedResult: "Return route or explicit wait", authority: "BIG",
    lens: { lensId: "LENS-SEARCH", lensReference: "lens://search", fittedView: "Do not invent" },
  });
  const returned = await loop.act(entered, { destination: MIMIR_DESTINATION, capability: mimir });
  assert.equal(returned.returnedPayload.status, "WAIT");
  assert.equal(returned.returnedPayload.next, "GO_REVIEW_WAIT");
  assert.equal(returned.returnedPayload.route, null);
});
