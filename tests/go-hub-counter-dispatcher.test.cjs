"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-counter-dispatcher.mjs")).href;

function storage() {
  const values = new Map();
  return {
    alarms:[],
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : undefined; },
    async put(key, value) { values.set(key, structuredClone(value)); },
    async setAlarm(value) { this.alarms.push(value); },
  };
}
function openInput() {
  return {
    counterId:"COUNTER-0099",
    workId:"WORK-GO-LIGHT",
    checkpointId:"CP-GO-LIGHT",
    request:"LIGHT, find the source in Notion AI Search",
    context:{ purpose:"dispatcher-smoke" },
    sourceHints:["Notion AI Search"],
    doNotChange:["Do not use MIMIR"],
  };
}

test("dispatcher fails closed as WAITING_TARGET when LIGHT wake target is not configured", async () => {
  const { GoHubCounterDispatchState } = await import(moduleUrl + "?missing=" + Date.now());
  const stateStorage = storage();
  const dispatch = new GoHubCounterDispatchState({ storage:stateStorage }, {});
  const result = await dispatch.enqueueOpen(openInput());
  assert.equal(result.ok, true);
  assert.equal(result.dispatch.legs.LIGHT.status, "WAITING_TARGET");
  assert.equal(result.dispatch.legs.LIGHT.attempts, 0);
  assert.equal(result.dispatch.legs.LIGHT.lastError, "CALLABLE_TARGET_NOT_CONFIGURED");
  assert.equal(stateStorage.alarms.length, 1);
});

test("OPEN dispatch wakes LIGHT once and duplicate OPEN does not redeliver", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls += 1;
    assert.equal(url, "https://light.example/wake");
    const payload = JSON.parse(init.body);
    assert.equal(payload.type, "NEW_COUNTER_TICKET");
    assert.equal(payload.target, "LIGHT");
    assert.equal(payload.counterId, "COUNTER-0099");
    return new Response(JSON.stringify({ receiptId:"light-1" }), {
      status:200,
      headers:{ "content-type":"application/json" },
    });
  };
  try {
    const { GoHubCounterDispatchState } = await import(moduleUrl + "?light=" + Date.now());
    const dispatch = new GoHubCounterDispatchState(
      { storage:storage() },
      { LIGHT_WAKE_URL:"https://light.example/wake" },
    );
    const first = await dispatch.enqueueOpen(openInput());
    assert.equal(first.dispatch.legs.LIGHT.status, "DELIVERED");
    assert.equal(first.dispatch.legs.LIGHT.receipt.receiptId, "light-1");
    const second = await dispatch.enqueueOpen(openInput());
    assert.equal(second.idempotent, true);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("LIGHT answer queues and wakes GO with the same Counter identity", async () => {
  const originalFetch = globalThis.fetch;
  const payloads = [];
  globalThis.fetch = async (_url, init) => {
    payloads.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ receiptId:"ok" }), {
      status:200,
      headers:{ "content-type":"application/json" },
    });
  };
  try {
    const { GoHubCounterDispatchState } = await import(moduleUrl + "?return=" + Date.now());
    const dispatch = new GoHubCounterDispatchState(
      { storage:storage() },
      {
        LIGHT_WAKE_URL:"https://light.example/wake",
        GO_WAKE_URL:"https://go.example/wake",
      },
    );
    await dispatch.enqueueOpen(openInput());
    const result = await dispatch.enqueueAnswer({
      counterId:"COUNTER-0099",
      workId:"WORK-GO-LIGHT",
      checkpointId:"CP-GO-LIGHT",
      status:"ANSWERED",
      answer:"Found the page.",
      sources:["notion://page/1"],
      evidence:[{ kind:"page", reference:"notion://page/1" }],
      confidence:"HIGH",
      nextRoute:"GO",
    });
    assert.equal(result.dispatch.legs.GO.status, "DELIVERED");
    assert.equal(payloads.length, 2);
    assert.deepEqual(
      { type:payloads[1].type, target:payloads[1].target, counterId:payloads[1].counterId },
      { type:"COUNTER_ANSWER_READY", target:"GO", counterId:"COUNTER-0099" },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("failed wake retries and ends in DEAD_LETTER after bounded attempts", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("no", { status:503 });
  try {
    const { GoHubCounterDispatchState, MAX_ATTEMPTS } = await import(moduleUrl + "?retry=" + Date.now());
    const dispatch = new GoHubCounterDispatchState(
      { storage:storage() },
      { LIGHT_WAKE_URL:"https://light.example/wake" },
    );
    let result = await dispatch.enqueueOpen(openInput());
    assert.equal(result.dispatch.legs.LIGHT.status, "RETRY_WAIT");
    for (let i = 1; i < MAX_ATTEMPTS; i += 1) {
      result = await dispatch.retry({
        counterId:"COUNTER-0099",
        workId:"WORK-GO-LIGHT",
        checkpointId:"CP-GO-LIGHT",
        target:"LIGHT",
      });
    }
    assert.equal(result.dispatch.legs.LIGHT.attempts, MAX_ATTEMPTS);
    assert.equal(result.dispatch.legs.LIGHT.status, "DEAD_LETTER");
    assert.equal(result.dispatch.legs.LIGHT.nextAttemptAt, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
