"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-lighthouse-control-port-session.js")).href;
class MemoryStorage {
  constructor() { this.map = new Map(); }
  async get(key) { return this.map.get(key); }
  async put(key, value) { this.map.set(key, value); }
}
async function load(tag) { return import(`${moduleUrl}?lhcp=${tag}-${Date.now()}`); }

test("Durable Object fetch bridge exposes session operations without RPC", async () => {
  const m = await load("fetch-bridge");
  const storage = new MemoryStorage();
  const registry = new m.LighthouseControlPortSessionRegistry({ storage });
  const response = await registry.fetch(new Request("https://lighthouse-control-port.internal/start", {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body:JSON.stringify({ deviceLabel:"Xiaomi 15T", ttlMs:60_000 }),
  }));
  assert.equal(response.status, 200);
  const started = await response.json();
  assert.equal(started.ok, true);
  assert.equal(typeof started.session_id, "string");
  assert.equal(typeof started.session_token, "string");
  const stored = await storage.get("state");
  assert.equal(stored.session.deviceLabel, "Xiaomi 15T");
  assert.equal(JSON.stringify(stored).includes(started.session_token), false);
});

test("owner bootstrap stores only token hash and issues runtime credential", async () => {
  const m = await load("start");
  const storage = new MemoryStorage();
  const service = m.createLighthouseControlPortSessionService({
    storage,
    now:() => 1_000,
    randomUUID:() => "lh-session-1",
    randomSessionToken:() => "device-token-1",
  });
  const started = await service.start({ deviceLabel:"Xiaomi 15T", ttlMs:60_000 });
  assert.equal(started.ok, true);
  assert.equal(started.session_id, "lh-session-1");
  assert.equal(started.session_token, "device-token-1");
  const stored = await storage.get("state");
  assert.equal(stored.session.deviceLabel, "Xiaomi 15T");
  assert.notEqual(stored.session.tokenHash, "device-token-1");
  assert.equal(JSON.stringify(stored).includes("device-token-1"), false);
});

test("Hub command roundtrip delivers command then accepts receipt and snapshot", async () => {
  const m = await load("roundtrip");
  let clock = 1_000;
  const service = m.createLighthouseControlPortSessionService({
    storage:new MemoryStorage(),
    now:() => clock,
    randomUUID:() => "lh-session-1",
    randomSessionToken:() => "device-token-1",
  });
  await service.start({ ttlMs:60_000 });
  const queued = await service.enqueue({
    requestId:"hub-1",
    capabilityId:"system.appState",
    payload:{},
  });
  assert.equal(queued.ok, true);
  const pulled = await service.pull({ sessionId:"lh-session-1", sessionToken:"device-token-1" });
  assert.equal(pulled.commands.length, 1);
  assert.equal(pulled.commands[0].requestId, "hub-1");
  clock = 2_000;
  assert.equal((await service.pushReceipts({
    sessionId:"lh-session-1",
    sessionToken:"device-token-1",
    receipts:[{ requestId:"hub-1", capabilityId:"system.appState", status:"DONE", updatedAt:"2026-09-18T12:00:00.000Z" }],
  })).ok, true);
  assert.equal((await service.pushState({
    sessionId:"lh-session-1",
    sessionToken:"device-token-1",
    packet:{ work:{ nextAction:"WAITING_COMMAND" }, snapshot:{ freshness:"LIVE", revision:4 }, syncedAt:"2026-09-18T12:00:00.000Z" },
  })).ok, true);
  const latest = await service.latest();
  assert.equal(latest.latest.snapshot.freshness, "LIVE");
  assert.equal(latest.receipts[0].status, "DONE");
  assert.equal((await service.pull({ sessionId:"lh-session-1", sessionToken:"device-token-1" })).commands.length, 0);
});

test("wrong token, requestId conflicts, and secret-shaped payloads fail closed", async () => {
  const m = await load("failclosed");
  const service = m.createLighthouseControlPortSessionService({
    storage:new MemoryStorage(),
    now:() => 1_000,
    randomUUID:() => "lh-session-1",
    randomSessionToken:() => "device-token-1",
  });
  await service.start({ ttlMs:60_000 });
  assert.equal((await service.pull({ sessionId:"lh-session-1", sessionToken:"wrong" })).code, "SESSION_INACTIVE");
  assert.equal((await service.enqueue({
    requestId:"hub-secret",
    capabilityId:"finance.income.create",
    payload:{ recoveryCode:"never" },
  })).code, "SCHEMA_REJECTED");
  assert.equal((await service.enqueue({ requestId:"hub-1", capabilityId:"system.appState", payload:{} })).ok, true);
  assert.equal((await service.enqueue({ requestId:"hub-1", capabilityId:"finance.balance", payload:{} })).code, "REQUEST_ID_CONFLICT");
});


test("realtime event hook signals command, receipts, and state changes without carrying session secrets", async () => {
  const m = await load("realtime-events");
  const events = [];
  const service = m.createLighthouseControlPortSessionService({
    storage:new MemoryStorage(),
    now:() => 1_000,
    randomUUID:() => "lh-session-live",
    randomSessionToken:() => "device-token-live",
    onEvent:async event => { events.push(event); },
  });
  await service.start({ ttlMs:60_000 });
  await service.enqueue({
    requestId:"live-command-1",
    capabilityId:"system.appState",
    payload:{},
  });
  await service.pushReceipts({
    sessionId:"lh-session-live",
    sessionToken:"device-token-live",
    receipts:[{ requestId:"live-command-1", capabilityId:"system.appState", status:"DONE", updatedAt:"2026-09-19T01:20:00.000Z" }],
  });
  await service.pushState({
    sessionId:"lh-session-live",
    sessionToken:"device-token-live",
    packet:{ work:{ nextAction:"WAITING_COMMAND" }, snapshot:{ freshness:"LIVE", revision:4 }, syncedAt:"2026-09-19T01:20:00.000Z" },
  });

  assert.deepEqual(events.map(event => event.type), ["COMMAND_AVAILABLE","RECEIPTS_UPDATED","STATE_UPDATED"]);
  assert.equal(events[0].requestId, "live-command-1");
  assert.equal(JSON.stringify(events).includes("device-token-live"), false);
});

test("live authentication uses the existing paired session credential and exposes only public session state", async () => {
  const m = await load("live-auth");
  const service = m.createLighthouseControlPortSessionService({
    storage:new MemoryStorage(),
    now:() => 1_000,
    randomUUID:() => "lh-session-live",
    randomSessionToken:() => "device-token-live",
  });
  await service.start({ ttlMs:60_000 });
  const ok = await service.authorizeLive({ sessionId:"lh-session-live", sessionToken:"device-token-live" });
  assert.equal(ok.ok, true);
  assert.equal(ok.session.sessionId, "lh-session-live");
  assert.equal(JSON.stringify(ok).includes("device-token-live"), false);
  assert.equal((await service.authorizeLive({ sessionId:"lh-session-live", sessionToken:"wrong" })).code, "SESSION_INACTIVE");
});
