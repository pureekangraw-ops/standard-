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
function openInput(overrides = {}) {
  return {
    counterId:"COUNTER-0099",
    workId:"WORK-GO-LIGHT",
    checkpointId:"CP-GO-LIGHT",
    request:"LIGHT, find the source in Notion AI Search",
    context:{ purpose:"dispatcher-smoke" },
    sourceHints:["Notion AI Search"],
    doNotChange:["Do not use MIMIR"],
    hubOrigin:"https://hub.example",
    ...overrides,
  };
}
function notionNamespace({
  connected = true,
  authorizationUrl = "https://notion.example/allow",
  searchStatus = 200,
  searchBody = null,
  calls = [],
} = {}) {
  const body = searchBody || {
    ok:true,
    workspaceId:"workspace-1",
    tool:"notion-ai-search",
    status:"ANSWERED",
    answer:"1. Counter Contract — Projects / GO Hub",
    sources:["https://notion.so/page-1"],
    evidence:[{ kind:"notion_ai_search_result", rank:1, title:"Counter Contract", position:"Projects / GO Hub", source:"https://notion.so/page-1" }],
    confidence:"NOTION_AI_SEARCH",
    nextRoute:"GO",
    resultCount:1,
  };
  return {
    getByName() {
      return {
        async fetch(request) {
          const input = JSON.parse(await request.text());
          calls.push(input.action);
          if (input.action === "status") {
            return new Response(JSON.stringify({ ok:true, connected }), {
              status:200, headers:{ "content-type":"application/json" },
            });
          }
          if (input.action === "prepare") {
            return new Response(JSON.stringify({ ok:true, authorizationUrl }), {
              status:200, headers:{ "content-type":"application/json" },
            });
          }
          if (input.action === "search") {
            return new Response(JSON.stringify(body), {
              status:searchStatus, headers:{ "content-type":"application/json" },
            });
          }
          return new Response(JSON.stringify({ ok:false, code:"UNEXPECTED_ACTION" }), { status:500 });
        },
      };
    },
  };
}

test("dispatcher fails closed as WAITING_TARGET when Notion LIGHT binding is absent", async () => {
  const { GoHubCounterDispatchState } = await import(moduleUrl + "?missing=" + Date.now());
  const stateStorage = storage();
  const dispatch = new GoHubCounterDispatchState({ storage:stateStorage }, {});
  const result = await dispatch.enqueueOpen(openInput());
  assert.equal(result.dispatch.legs.LIGHT.status, "WAITING_TARGET");
  assert.equal(result.dispatch.legs.LIGHT.attempts, 0);
  assert.equal(result.dispatch.legs.LIGHT.nextAttemptAt, null);
  assert.equal(stateStorage.alarms.length, 0);
});

test("legacy WAITING_TARGET timestamp is reconciled once", async () => {
  const { createCounterDispatchCore } = await import(moduleUrl + "?legacy=" + Date.now());
  const core = createCounterDispatchCore({ now:() => Date.parse("2026-09-19T16:55:00.000Z") });
  let state = core.enqueueOpen(openInput()).dispatch;
  state = core.waitingTarget({ target:"LIGHT" }, state).dispatch;
  state.legs.LIGHT.nextAttemptAt = "2026-09-19T16:50:28.457Z";
  const reconciled = core.waitingTarget({ target:"LIGHT" }, state);
  assert.equal(reconciled.dispatch.legs.LIGHT.nextAttemptAt, null);
  assert.equal(reconciled.dispatch.events.at(-1).type, "WAITING_TARGET_RECONCILED");
  const stable = core.waitingTarget({ target:"LIGHT" }, reconciled.dispatch);
  assert.equal(stable.idempotent, true);
});

test("unauthorized Notion LIGHT returns WAITING_AUTH and a real authorization URL without a delivery attempt", async () => {
  const { GoHubCounterDispatchState } = await import(moduleUrl + "?auth=" + Date.now());
  const calls = [];
  const dispatch = new GoHubCounterDispatchState(
    { storage:storage() },
    { GO_HUB_NOTION_LIGHT_STATE:notionNamespace({ connected:false, calls }) },
  );
  const result = await dispatch.enqueueOpen(openInput());
  assert.equal(result.dispatch.legs.LIGHT.status, "WAITING_AUTH");
  assert.equal(result.dispatch.legs.LIGHT.attempts, 0);
  assert.equal(result.authRequired, true);
  assert.equal(result.authorizationUrl, "https://notion.example/allow");
  assert.deepEqual(calls, ["status","prepare"]);
});

test("same Counter ticket retries after OAuth and returns Notion AI Search answer", async () => {
  const { GoHubCounterDispatchState } = await import(moduleUrl + "?oauth-retry=" + Date.now());
  const calls = [];
  const ns = notionNamespace({ connected:false, calls });
  const env = { GO_HUB_NOTION_LIGHT_STATE:ns };
  const dispatch = new GoHubCounterDispatchState({ storage:storage() }, env);

  const first = await dispatch.enqueueOpen(openInput());
  assert.equal(first.dispatch.legs.LIGHT.status, "WAITING_AUTH");

  env.GO_HUB_NOTION_LIGHT_STATE = notionNamespace({ connected:true, calls });
  const second = await dispatch.enqueueOpen(openInput());
  assert.equal(second.dispatch.legs.LIGHT.status, "DELIVERED");
  assert.equal(second.dispatch.legs.LIGHT.attempts, 1);
  assert.equal(second.dispatch.legs.LIGHT.receipt.tool, "notion-ai-search");
  assert.equal(second.lightAnswer.status, "ANSWERED");
  assert.deepEqual(second.lightAnswer.sources, ["https://notion.so/page-1"]);
});

test("Notion AI Search unavailable blocks without fallback or retry alarm", async () => {
  const { GoHubCounterDispatchState } = await import(moduleUrl + "?blocked=" + Date.now());
  const stateStorage = storage();
  const dispatch = new GoHubCounterDispatchState(
    { storage:stateStorage },
    {
      GO_HUB_NOTION_LIGHT_STATE:notionNamespace({
        connected:true,
        searchStatus:409,
        searchBody:{ ok:false, code:"NOTION_AI_SEARCH_UNAVAILABLE", status:"upgrade_required", upgradeUrl:"https://notion.so/upgrade" },
      }),
    },
  );
  const result = await dispatch.enqueueOpen(openInput());
  assert.equal(result.dispatch.legs.LIGHT.status, "BLOCKED");
  assert.match(result.dispatch.legs.LIGHT.lastError, /NOTION_AI_SEARCH_UNAVAILABLE/);
  assert.equal(result.capabilityBlocked, true);
  assert.equal(result.upgradeUrl, "https://notion.so/upgrade");
  assert.equal(stateStorage.alarms.length, 0);
});

test("Notion transport failure retries and ends in DEAD_LETTER after bounded attempts", async () => {
  const { GoHubCounterDispatchState, MAX_ATTEMPTS } = await import(moduleUrl + "?retry=" + Date.now());
  const stateStorage = storage();
  const dispatch = new GoHubCounterDispatchState(
    { storage:stateStorage },
    {
      GO_HUB_NOTION_LIGHT_STATE:notionNamespace({
        connected:true,
        searchStatus:503,
        searchBody:{ ok:false, code:"NOTION_TEMPORARY_FAILURE" },
      }),
    },
  );
  let result = await dispatch.enqueueOpen(openInput());
  assert.equal(result.dispatch.legs.LIGHT.status, "RETRY_WAIT");
  for (let i = 1; i < MAX_ATTEMPTS; i += 1) {
    result = await dispatch.retry({
      counterId:"COUNTER-0099",
      workId:"WORK-GO-LIGHT",
      checkpointId:"CP-GO-LIGHT",
      target:"LIGHT",
      hubOrigin:"https://hub.example",
    });
  }
  assert.equal(result.dispatch.legs.LIGHT.attempts, MAX_ATTEMPTS);
  assert.equal(result.dispatch.legs.LIGHT.status, "DEAD_LETTER");
  assert.equal(result.dispatch.legs.LIGHT.nextAttemptAt, null);
  assert.ok(stateStorage.alarms.length >= 1);
});

test("GO return leg still uses its own wake endpoint and never substitutes for LIGHT", async () => {
  const originalFetch = globalThis.fetch;
  const outgoing = [];
  globalThis.fetch = async (url, init) => {
    outgoing.push({ url:String(url), body:JSON.parse(init.body) });
    return new Response(JSON.stringify({ receiptId:"go-1" }), {
      status:200, headers:{ "content-type":"application/json" },
    });
  };
  try {
    const { GoHubCounterDispatchState } = await import(moduleUrl + "?go-return=" + Date.now());
    const dispatch = new GoHubCounterDispatchState(
      { storage:storage() },
      {
        GO_HUB_NOTION_LIGHT_STATE:notionNamespace({ connected:true }),
        GO_WAKE_URL:"https://go.example/wake",
      },
    );
    const opened = await dispatch.enqueueOpen(openInput());
    assert.equal(opened.dispatch.legs.LIGHT.status, "DELIVERED");
    const answered = await dispatch.enqueueAnswer({
      counterId:"COUNTER-0099",
      workId:"WORK-GO-LIGHT",
      checkpointId:"CP-GO-LIGHT",
      status:"ANSWERED",
      answer:"Found the page.",
      sources:["https://notion.so/page-1"],
      evidence:[{ kind:"notion_ai_search_result", source:"https://notion.so/page-1" }],
      confidence:"NOTION_AI_SEARCH",
      nextRoute:"GO",
    });
    assert.equal(answered.dispatch.legs.GO.status, "DELIVERED");
    assert.equal(outgoing.length, 1);
    assert.equal(outgoing[0].url, "https://go.example/wake");
    assert.equal(outgoing[0].body.target, "GO");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
