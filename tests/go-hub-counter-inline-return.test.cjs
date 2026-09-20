"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-counter-dispatcher.mjs")).href;

function storage(seed = null) {
  const values = new Map(seed ? [["dispatch", structuredClone(seed)]] : []);
  return {
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : undefined; },
    async put(key, value) { values.set(key, structuredClone(value)); },
    async setAlarm() {},
  };
}

test("inline GO return marks the return leg delivered without a wake URL", async () => {
  const { createCounterDispatchCore, GoHubCounterDispatchState } =
    await import(moduleUrl + "?inline=" + Date.now());
  const core = createCounterDispatchCore({ now:() => Date.parse("2026-09-20T00:05:00.000Z") });

  let state = core.enqueueOpen({
    counterId:"COUNTER-INLINE-1",
    workId:"WORK-1",
    checkpointId:"CP-1",
    request:"Find in Notion",
  }).dispatch;
  state = core.beginAttempt({ target:"LIGHT" }, state).dispatch;
  state = core.delivered({
    target:"LIGHT",
    receipt:{ httpStatus:200, receiptId:"notion-ai-search", tool:"notion-ai-search" },
  }, state).dispatch;

  const dispatch = new GoHubCounterDispatchState({ storage:storage(state) }, {});
  const input = {
    counterId:"COUNTER-INLINE-1",
    workId:"WORK-1",
    checkpointId:"CP-1",
    status:"ANSWERED",
    answer:"Found it",
    sources:["notion://page/1"],
    evidence:[{ kind:"notion_ai_search_result", source:"notion://page/1" }],
    confidence:"NOTION_AI_SEARCH",
    nextRoute:"GO",
  };

  const first = await dispatch.returnInline(input);
  assert.equal(first.inlineReturn, true);
  assert.equal(first.dispatch.legs.GO.status, "DELIVERED");
  assert.equal(first.dispatch.legs.GO.attempts, 1);
  assert.equal(first.dispatch.legs.GO.receipt.transport, "INLINE");
  assert.equal(first.dispatch.legs.GO.receipt.receiptId, "factory-mcp-inline-return");

  const revision = first.dispatch.revision;
  const second = await dispatch.returnInline(input);
  assert.equal(second.idempotent, true);
  assert.equal(second.dispatch.revision, revision);
  assert.equal(second.dispatch.legs.GO.status, "DELIVERED");
});
