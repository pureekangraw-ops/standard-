"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "../go-hub-global-audit.mjs")).href;

class MemoryStorage {
  constructor() { this.map = new Map(); }
  async get(key) { return this.map.get(key); }
  async put(key, value) {
    if (typeof key === "object" && key && value === undefined) {
      for (const [name, current] of Object.entries(key)) this.map.set(name, structuredClone(current));
      return;
    }
    this.map.set(key, structuredClone(value));
  }
  async list({ prefix } = {}) {
    const entries = [...this.map.entries()]
      .filter(([key]) => !prefix || key.startsWith(prefix))
      .sort(([a],[b]) => a.localeCompare(b));
    return new Map(entries);
  }
}

async function call(instance, body) {
  const response = await instance.fetch(new Request("https://audit.test", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
  return { status: response.status, body: await response.json() };
}

test("global audit appends immutable sequence records and filters by Work ID", async () => {
  const { GoHubGlobalAuditLog } = await import(moduleUrl + "?append=" + Date.now());
  const instance = new GoHubGlobalAuditLog({ storage: new MemoryStorage() }, {});
  for (const event of [
    { eventId:"EV-1", type:"CENTRE_START", workId:"WORK-A", checkpointId:"CP-A", phase:"ARRIVED", details:{} },
    { eventId:"EV-2", type:"CENTRE_START", workId:"WORK-B", checkpointId:"CP-B", phase:"ARRIVED", details:{} },
    { eventId:"EV-3", type:"CENTRE_REVIEW", workId:"WORK-A", checkpointId:"CP-A", phase:"REVIEW", details:{} },
  ]) {
    assert.equal((await call(instance, { action:"append", event })).status, 200);
  }
  const history = await call(instance, { action:"history", workId:"WORK-A", afterSequence:0, limit:20 });
  assert.equal(history.status, 200);
  assert.deepEqual(history.body.events.map(item => item.sequence), [1,3]);
  assert.deepEqual(history.body.events.map(item => item.event.type), ["CENTRE_START","CENTRE_REVIEW"]);
  assert.equal(history.body.lastSequence, 3);
});

test("global audit duplicate event IDs are idempotent but conflicting rewrites fail", async () => {
  const { GoHubGlobalAuditLog } = await import(moduleUrl + "?duplicate=" + Date.now());
  const instance = new GoHubGlobalAuditLog({ storage: new MemoryStorage() }, {});
  const event = { eventId:"EV-X", type:"CENTRE_START", workId:"WORK-X", checkpointId:"CP-X", phase:"ARRIVED", at:"2026-09-19T00:00:00.000Z", details:{} };
  const first = await call(instance, { action:"append", event });
  const again = await call(instance, { action:"append", event });
  assert.equal(first.body.sequence, 1);
  assert.equal(again.body.sequence, 1);
  assert.equal(again.body.idempotent, true);
  const conflict = await call(instance, { action:"append", event:{ ...event, type:"CENTRE_REVIEW" } });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, "GLOBAL_AUDIT_EVENT_ID_CONFLICT");
});
