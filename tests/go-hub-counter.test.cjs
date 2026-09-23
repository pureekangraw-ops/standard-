"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-counter.mjs")).href;
const workContext = Object.freeze({
  workId: "WORK-COUNTER-1",
  checkpointId: "CP-COUNTER-1",
  returnAddress: "CP-COUNTER-1",
  destination: "destination://counter",
  task: "Ask LIGHT through shared Counter",
  requestedResult: "Evidence-backed answer",
  lensReference: "identity://light",
});

function clock() {
  const values = [
    "2026-09-19T16:00:00.000Z",
    "2026-09-19T16:00:01.000Z",
    "2026-09-19T16:00:02.000Z",
    "2026-09-19T16:00:03.000Z",
  ];
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

test("Counter keeps one identity from OPEN through GO readback and CLOSED", async () => {
  const { createCounterCore } = await import(moduleUrl + "?roundtrip=" + Date.now());
  const core = createCounterCore({ now: clock() });

  let result = core.create({
    counterId: "COUNTER-0001",
    request: "Where is GO Hub current source?",
    context: { purpose: "smoke" },
    sourceHints: ["MIMIR Catalog"],
    doNotChange: ["Do not create Knowledge"],
    workContext,
  });
  let state = result.counter;
  assert.equal(state.currentState, "OPEN");
  assert.equal(state.workId, workContext.workId);
  assert.equal(state.checkpointId, workContext.checkpointId);

  state = core.seen({ counterId: "COUNTER-0001", workContext }, state).counter;
  assert.equal(state.currentState, "SEEN");

  state = core.answer({
    counterId: "COUNTER-0001",
    status: "ANSWERED",
    answer: "GO Hub current source is registered in MIMIR Catalog.",
    sources: ["notion://mimir-catalog/go-hub"],
    evidence: [{ kind: "catalog-row", reference: "catalog://go-hub" }],
    confidence: "verified",
    nextRoute: "destination://factory",
    workContext,
  }, state).counter;
  assert.equal(state.currentState, "ANSWERED");

  state = core.readback({
    counterId: "COUNTER-0001",
    evidence: { kind: "go-readback", reference: "counter://COUNTER-0001/revision/3" },
    workContext,
  }, state).counter;

  assert.equal(state.currentState, "CLOSED");
  assert.deepEqual(state.events.map(event => event.type), ["OPEN", "SEEN", "ANSWERED", "READBACK", "CLOSED"]);
  assert.equal(state.counterId, "COUNTER-0001");
  assert.equal(state.revision, 4);
});

test("Counter repeat reads/actions are idempotent and do not create duplicate events", async () => {
  const { createCounterCore } = await import(moduleUrl + "?idempotent=" + Date.now());
  const core = createCounterCore({ now: clock() });
  const createInput = {
    counterId: "COUNTER-0001",
    request: "Find one catalog item",
    context: {},
    workContext,
  };
  let state = core.create(createInput).counter;
  const duplicateCreate = core.create(createInput, state);
  assert.equal(duplicateCreate.idempotent, true);
  assert.equal(duplicateCreate.counter.events.length, 1);

  state = core.seen({ counterId: "COUNTER-0001", workContext }, state).counter;
  const repeatedSeen = core.seen({ counterId: "COUNTER-0001", workContext }, state);
  assert.equal(repeatedSeen.idempotent, true);
  assert.deepEqual(repeatedSeen.counter.events.map(event => event.type), ["OPEN", "SEEN"]);
});

test("Counter validates local answer evidence without owning Hub passage acceptance", async () => {
  const { createCounterCore } = await import(moduleUrl + "?authority=" + Date.now());
  const core = createCounterCore({ now: clock() });
  let state = core.create({ counterId:"COUNTER-0002", request:"Find record", context:{}, workContext }).counter;
  state = core.seen({ counterId:"COUNTER-0002", workContext }, state).counter;
  assert.throws(() => core.answer({ counterId:"COUNTER-0002", status:"ANSWERED", answer:"Candidate answer", sources:[], evidence:[], workContext }, state), /SOURCE_AND_EVIDENCE/);
  const candidate = core.answer({ counterId:"COUNTER-0002", status:"ANSWERED", answer:"Candidate answer", sources:["notion://result"], evidence:[{kind:"source",reference:"notion://result"}], workContext }, state).counter;
  assert.equal(candidate.currentState, "ANSWERED");
});

test("Durable Object writes state and reads the exact same ticket back", async () => {
  const { GoHubCounterState } = await import(moduleUrl + "?durable=" + Date.now());
  const values = new Map();
  const storage = {
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : undefined; },
    async put(key, value) { values.set(key, structuredClone(value)); },
  };
  const durable = new GoHubCounterState({ storage }, {});
  await durable.act({
    action: "create",
    counterId: "COUNTER-0003",
    request: "Read durable ticket",
    context: {},
    workContext,
  });
  const readback = await durable.act({
    action: "get",
    counterId: "COUNTER-0003",
    workContext,
  });
  assert.equal(readback.counter.counterId, "COUNTER-0003");
  assert.equal(readback.counter.currentState, "OPEN");
  assert.deepEqual(readback.counter.events.map(event => event.type), ["OPEN"]);
});


test("WAIT and NEEDS_INPUT readbacks stay open by default and LIGHT can continue", async () => {
  const { createCounterCore } = await import(moduleUrl + "?continuation=" + Date.now());
  const core = createCounterCore({ now: clock() });

  let state = core.create({
    counterId: "COUNTER-CONTINUE-1",
    request: "Need a multi-turn result",
    context: {},
    workContext,
  }).counter;
  state = core.seen({ counterId: "COUNTER-CONTINUE-1", workContext }, state).counter;

  state = core.answer({
    counterId: "COUNTER-CONTINUE-1",
    status: "WAIT",
    answer: "Still working.",
    sources: [],
    evidence: [],
    workContext,
  }, state).counter;

  state = core.readback({
    counterId: "COUNTER-CONTINUE-1",
    evidence: { kind: "go-readback", step: "wait" },
    workContext,
  }, state).counter;
  assert.equal(state.currentState, "WAIT");
  assert.equal(state.closedAt, null);

  state = core.answer({
    counterId: "COUNTER-CONTINUE-1",
    status: "NEEDS_INPUT",
    answer: "Need one more input.",
    sources: [],
    evidence: [],
    workContext,
  }, state).counter;

  state = core.readback({
    counterId: "COUNTER-CONTINUE-1",
    evidence: { kind: "go-readback", step: "needs-input" },
    workContext,
  }, state).counter;
  assert.equal(state.currentState, "NEEDS_INPUT");
  assert.equal(state.closedAt, null);

  state = core.answer({
    counterId: "COUNTER-CONTINUE-1",
    status: "ANSWERED",
    answer: "Finished.",
    sources: ["notion://result/final"],
    evidence: [{ kind: "result", reference: "notion://result/final" }],
    workContext,
  }, state).counter;

  state = core.readback({
    counterId: "COUNTER-CONTINUE-1",
    evidence: { kind: "go-readback", step: "final" },
    workContext,
  }, state).counter;

  assert.equal(state.currentState, "CLOSED");
  assert.deepEqual(
    state.events.map(event => event.type),
    ["OPEN", "SEEN", "WAIT", "READBACK", "NEEDS_INPUT", "READBACK", "ANSWERED", "READBACK", "CLOSED"],
  );
});

test("readback close:false can be followed by a later close", async () => {
  const { createCounterCore } = await import(moduleUrl + "?deferred-close=" + Date.now());
  const core = createCounterCore({ now: clock() });

  let state = core.create({
    counterId: "COUNTER-DEFER-CLOSE-1",
    request: "Answer now, close later",
    context: {},
    workContext,
  }).counter;
  state = core.seen({ counterId: "COUNTER-DEFER-CLOSE-1", workContext }, state).counter;
  state = core.answer({
    counterId: "COUNTER-DEFER-CLOSE-1",
    status: "ANSWERED",
    answer: "Ready.",
    sources: ["notion://result/1"],
    evidence: [{ kind: "result", reference: "notion://result/1" }],
    workContext,
  }, state).counter;

  state = core.readback({
    counterId: "COUNTER-DEFER-CLOSE-1",
    evidence: { kind: "go-readback", reference: "counter://defer/first" },
    close: false,
    workContext,
  }, state).counter;
  assert.equal(state.currentState, "ANSWERED");
  assert.equal(state.closedAt, null);

  state = core.readback({
    counterId: "COUNTER-DEFER-CLOSE-1",
    evidence: { kind: "go-readback", reference: "counter://defer/final" },
    workContext,
  }, state).counter;

  assert.equal(state.currentState, "CLOSED");
  assert.deepEqual(
    state.events.map(event => event.type),
    ["OPEN", "SEEN", "ANSWERED", "READBACK", "READBACK", "CLOSED"],
  );
});
