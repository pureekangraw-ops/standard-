"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const dispatcherUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-counter-dispatcher.mjs")).href;

function storage() {
  const values = new Map();
  return {
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : undefined; },
    async put(key, value) { values.set(key, structuredClone(value)); },
    async setAlarm() {},
  };
}

function notionNamespace(responseBody, status = 500) {
  return {
    getByName() {
      return {
        async fetch() {
          return new Response(JSON.stringify(responseBody), {
            status,
            headers: { "content-type": "application/json" },
          });
        },
      };
    },
  };
}

const input = {
  counterId: "COUNTER-PICKUP-BELL-SEAM-TEST-001",
  workId: "WORK-GO-LIGHT-COUNTER-20260919-001",
  checkpointId: "CP-GO-LIGHT-COUNTER-001",
  mode: "HANDOFF",
  request: "Inspect the governed source and report evidence.",
  requestedResult: "Evidence-backed answer.",
  authority: "BIG",
  target: "GO Hub",
  projectRef: "GO Hub",
  fromActor: "GO",
  toActor: "LIGHT",
  context: { direction: "GO_TO_LIGHT" },
  workContext: {
    workId: "WORK-GO-LIGHT-COUNTER-20260919-001",
    checkpointId: "CP-GO-LIGHT-COUNTER-001",
  },
};

test("Bell failure leaves HANDOFF available for pickup and records an independent retry state", async () => {
  const { GoHubCounterDispatchState } = await import(dispatcherUrl + "?bell-failure=" + Date.now());
  const service = new GoHubCounterDispatchState({ storage: storage() }, {
    GO_HUB_NOTION_LIGHT_STATE: notionNamespace({ ok: false, code: "NOTION_CREATE_COMMENT_FAILED" }),
    LIGHT_BELL_PAGE_ID: "light-bell-page",
  });

  const response = await service.fetch(new Request("https://counter-dispatch.internal/open", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "open", ...input }),
  }));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.bellFailed, true);
  assert.equal(payload.dispatch.legs.LIGHT.status, "WAITING_PICKUP");
  assert.equal(payload.dispatch.legs.LIGHT.attempts, 0);
  assert.equal(payload.dispatch.bell.status, "RETRY_WAIT");
  assert.equal(payload.dispatch.bell.attempts, 1);
  assert.equal(payload.dispatch.bell.lastError, "NOTION_CREATE_COMMENT_FAILED");
  assert.equal(payload.dispatch.events.at(-1).type, "WAITING_PICKUP");
  assert.ok(payload.dispatch.events.some(event => event.type === "BELL_RETRY_WAIT"));
});


test("Successful bell stays retryable until LIGHT actually picks up the Counter", async () => {
  const { GoHubCounterDispatchState } = await import(dispatcherUrl + "?bell-pickup-retry=" + Date.now());
  const service = new GoHubCounterDispatchState({ storage: storage() }, {
    GO_HUB_NOTION_LIGHT_STATE: notionNamespace({ ok: true, receiptId: "notion-comment-1" }, 200),
    LIGHT_BELL_PAGE_ID: "light-bell-page",
  });

  const openedResponse = await service.fetch(new Request("https://counter-dispatch.internal/open", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "open", ...input }),
  }));
  assert.equal(openedResponse.status, 200);
  const opened = await openedResponse.json();
  assert.equal(opened.ok, true);
  assert.equal(opened.waitingPickup, true);
  assert.equal(opened.dispatch.legs.LIGHT.status, "WAITING_PICKUP");
  assert.equal(opened.dispatch.bell.status, "RETRY_WAIT");
  assert.equal(opened.dispatch.bell.attempts, 1);
  assert.ok(opened.dispatch.bell.nextAttemptAt);
  assert.ok(opened.dispatch.events.some(event => event.type === "BELL_RUNG_WAITING_PICKUP"));

  const pickupResponse = await service.fetch(new Request("https://counter-dispatch.internal/pickup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "pickup",
      counterId: input.counterId,
      workId: input.workId,
      checkpointId: input.checkpointId,
      actor: "LIGHT",
    }),
  }));
  assert.equal(pickupResponse.status, 200);
  const pickedUp = await pickupResponse.json();
  assert.equal(pickedUp.ok, true);
  assert.equal(pickedUp.dispatch.legs.LIGHT.status, "DELIVERED");
  assert.equal(pickedUp.dispatch.bell.status, "DELIVERED");
  assert.equal(pickedUp.dispatch.bell.nextAttemptAt, null);
  assert.equal(pickedUp.dispatch.events.at(-1).type, "PICKED_UP");
});
