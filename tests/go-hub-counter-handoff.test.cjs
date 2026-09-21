"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const dispatcherUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-counter-dispatcher.mjs")).href;
const counterUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-counter.mjs")).href;

function storage() {
  const values = new Map();
  return {
    alarms: [],
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : undefined; },
    async put(key, value) { values.set(key, structuredClone(value)); },
    async setAlarm(value) { this.alarms.push(value); },
  };
}

const workContext = {
  workId: "WORK-GO-LIGHT-COUNTER-20260919-001",
  checkpointId: "CP-GO-LIGHT-COUNTER-001",
};

function handoffInput(overrides = {}) {
  return {
    counterId: "COUNTER-HANDOFF-001",
    mode: "HANDOFF",
    workId: workContext.workId,
    checkpointId: workContext.checkpointId,
    request: "Inspect the Counter dispatcher implementation and return the exact test evidence.",
    requestedResult: "Evidence-backed implementation result with exact SHA and test output.",
    authority: "GO governs route; LIGHT may use only its existing bounded MCP allowlist.",
    target: "pureekangraw-ops/standard-",
    projectRef: "GO Hub",
    workContext,
    context: { repository: "pureekangraw-ops/standard-", purpose: "code-read" },
    sourceHints: ["GitHub repository truth"],
    doNotChange: ["Do not invoke Notion AI Search", "Do not merge or delete"],
    ...overrides,
  };
}

test("HANDOFF with no callable LIGHT target stays WAITING_PICKUP and never calls Notion", async () => {
  const { GoHubCounterDispatchState } = await import(dispatcherUrl + "?handoff-wait=" + Date.now());
  const stateStorage = storage();
  const calls = [];
  const dispatch = new GoHubCounterDispatchState({ storage: stateStorage }, {
    GO_HUB_NOTION_LIGHT_STATE: { getByName() { return { fetch: async () => { calls.push("notion"); throw new Error("must not call Notion"); } }; } },
  });
  const result = await dispatch.enqueueOpen(handoffInput());
  assert.equal(result.dispatch.mode, "HANDOFF");
  assert.equal(result.dispatch.legs.LIGHT.status, "WAITING_PICKUP");
  assert.equal(result.dispatch.legs.LIGHT.attempts, 0);
  assert.deepEqual(calls, []);
  assert.equal(stateStorage.alarms.length, 0);
});

test("HANDOFF rings the existing Notion LIGHT mirror and remains waiting for pickup", async () => {
  const { GoHubCounterDispatchState } = await import(dispatcherUrl + "?handoff-bell=" + Date.now());
  const calls = [];
  const dispatch = new GoHubCounterDispatchState({ storage: storage() }, {
    LIGHT_BELL_PAGE_ID: "88970e1da0a64ceebaa1ac1928361911",
    GO_HUB_NOTION_LIGHT_STATE: {
      getByName() {
        return {
          fetch: async request => {
            calls.push(JSON.parse(await request.text()));
            return new Response(JSON.stringify({ ok:true, receiptId:"comment-1" }), {
              status:200,
              headers:{ "content-type":"application/json" },
            });
          },
        };
      },
    },
  });
  const result = await dispatch.enqueueOpen(handoffInput());
  assert.equal(result.dispatch.legs.LIGHT.status, "WAITING_PICKUP");
  assert.equal(result.dispatch.legs.LIGHT.lastError, null);
  assert.equal(result.dispatch.legs.LIGHT.receipt.adapter, "notion-light-counter-bell");
  assert.equal(result.dispatch.legs.LIGHT.receipt.receiptId, "comment-1");
  assert.equal(result.dispatch.events.at(-1).type, "RUNG");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    action:"ring",
    bellType:"LIGHT_HANDOFF",
    pageId:"88970e1da0a64ceebaa1ac1928361911",
    counterId:"COUNTER-HANDOFF-001",
    workId:workContext.workId,
    checkpointId:workContext.checkpointId,
  });
});

test("HANDOFF wake receives the complete envelope and receipt names the handoff adapter", async () => {
  const { GoHubCounterDispatchState } = await import(dispatcherUrl + "?handoff-wake=" + Date.now());
  const outgoing = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    outgoing.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ receiptId: "light-wake-1" }), {
      status: 202,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const dispatch = new GoHubCounterDispatchState({ storage: storage() }, {
      LIGHT_WAKE_URL: "https://light.example/wake",
    });
    const result = await dispatch.enqueueOpen(handoffInput());
    assert.equal(result.dispatch.legs.LIGHT.status, "DELIVERED");
    assert.equal(result.dispatch.legs.LIGHT.receipt.adapter, "light-counter-handoff-wake");
    assert.equal(result.dispatch.legs.LIGHT.receipt.mode, "HANDOFF");
    assert.equal(outgoing.length, 1);
    assert.deepEqual(outgoing[0].body, {
      type: "NEW_COUNTER_TICKET",
      target: "LIGHT",
      from: "GO",
      to: "LIGHT",
      counterId: "COUNTER-HANDOFF-001",
      workId: workContext.workId,
      checkpointId: workContext.checkpointId,
      mode: "HANDOFF",
      request: handoffInput().request,
      requestedResult: handoffInput().requestedResult,
      authority: handoffInput().authority,
      targetReference: handoffInput().target,
      projectRef: handoffInput().projectRef,
      workContext,
      context: handoffInput().context,
      sourceHints: handoffInput().sourceHints,
      doNotChange: handoffInput().doNotChange,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Counter preserves explicit mode and handoff envelope through SEEN and ANSWERED", async () => {
  const { createCounterCore } = await import(counterUrl + "?envelope=" + Date.now());
  const core = createCounterCore({ now: () => "2026-09-21T00:00:00.000Z" });
  let state = core.create({ ...handoffInput(), workContext }).counter;
  assert.equal(state.mode, "HANDOFF");
  assert.equal(state.requestedResult, handoffInput().requestedResult);
  assert.equal(state.authority, handoffInput().authority);
  assert.equal(state.target, handoffInput().target);
  assert.equal(state.projectRef, handoffInput().projectRef);
  state = core.seen({ counterId: state.counterId, workContext }, state).counter;
  state = core.answer({
    counterId: state.counterId,
    status: "ANSWERED",
    answer: "Dispatcher tests are ready for GO review.",
    sources: ["https://github.com/pureekangraw-ops/standard-"],
    evidence: [{ kind: "test", name: "go-light-counter-handoff" }],
    workContext,
  }, state).counter;
  assert.equal(state.currentState, "ANSWERED");
  assert.equal(state.workId, workContext.workId);
  assert.equal(state.checkpointId, workContext.checkpointId);
});

test("reverse LIGHT to GO HANDOFF is queued for GO pickup without touching Notion", async () => {
  const { GoHubCounterDispatchState } = await import(dispatcherUrl + "?reverse-handoff=" + Date.now());
  const calls = [];
  const dispatch = new GoHubCounterDispatchState({ storage: storage() }, {
    GO_HUB_NOTION_LIGHT_STATE: { getByName() { return { fetch: async () => { calls.push("notion"); throw new Error("must not call Notion"); } }; } },
  });
  const result = await dispatch.enqueueOpen(handoffInput({
    counterId: "COUNTER-HANDOFF-REVERSE-001",
    fromActor: "LIGHT",
    toActor: "GO",
  }));
  assert.equal(result.dispatch.fromActor, "LIGHT");
  assert.equal(result.dispatch.toActor, "GO");
  assert.equal(result.dispatch.legs.GO.status, "WAITING_PICKUP");
  assert.equal(result.dispatch.legs.GO.attempts, 0);
  assert.deepEqual(calls, []);
});

test("SEARCH remains the only route that invokes Notion AI Search", async () => {
  const { GoHubCounterDispatchState } = await import(dispatcherUrl + "?search-compat=" + Date.now());
  const calls = [];
  const namespace = { getByName() { return { fetch: async request => {
    const body = JSON.parse(await request.text());
    calls.push(body.action);
    if (body.action === "status") return new Response(JSON.stringify({ ok: true, connected: true }), { status: 200 });
    if (body.action === "search") return new Response(JSON.stringify({
      ok: true, tool: "notion-ai-search", status: "ANSWERED", answer: "Found it",
      sources: ["https://notion.so/source"], evidence: [{ kind: "notion" }],
    }), { status: 200 });
    return new Response(JSON.stringify({ ok: false }), { status: 500 });
  } }; } };
  const dispatch = new GoHubCounterDispatchState({ storage: storage() }, { GO_HUB_NOTION_LIGHT_STATE: namespace });
  const result = await dispatch.enqueueOpen(handoffInput({
    counterId: "COUNTER-SEARCH-001",
    mode: "SEARCH",
    requestedResult: null,
  }));
  assert.equal(result.dispatch.legs.LIGHT.status, "DELIVERED");
  assert.equal(result.dispatch.legs.LIGHT.receipt.tool, "notion-ai-search");
  assert.deepEqual(calls, ["status", "search"]);
});
