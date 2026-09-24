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



test("Centre Board pin identifiers and recovery status metadata are not mistaken for device secrets", async () => {
  const m = await load("centre-board-schema");
  const service = m.createLighthouseControlPortSessionService({
    storage:new MemoryStorage(),
    now:() => 1_000,
    randomUUID:() => "lh-session-board",
    randomSessionToken:() => "device-token-board",
  });
  await service.start({ ttlMs:60_000 });

  const queued = await service.enqueue({
    requestId:"board-claim-1",
    capabilityId:"centreBoard.claim",
    payload:{
      workId:"WORK-1",
      employeeId:"GO-1",
      pinIds:["pin-1","pin-2"],
      expectedRevision:3,
      status:"PENDING_RECOVERY",
    },
  });
  assert.equal(queued.ok, true);

  assert.equal((await service.pushState({
    sessionId:"lh-session-board",
    sessionToken:"device-token-board",
    packet:{
      snapshot:{
        values:{
          "centreBoard.read":{
            boardId:"board-1",
            workId:"WORK-1",
            revision:3,
            pins:[{ pinId:"pin-1", status:"PENDING_RECOVERY", touchedBy:["GO-1"] }],
          },
        },
      },
    },
  })).ok, true);

  for (const [requestId, payload] of [
    ["secret-pin", { pin:"1234" }],
    ["secret-password", { devicePassword:"never" }],
    ["secret-recovery", { recoveryCode:"never" }],
    ["secret-token", { sessionToken:"never" }],
  ]) {
    assert.equal((await service.enqueue({
      requestId,
      capabilityId:"system.appState",
      payload,
    })).code, "SCHEMA_REJECTED");
  }
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


test("Hub-side Centre Board projection survives device session restart and archives returned work", async () => {
  const m = await load("hub-board-projection");
  let clock = Date.parse("2026-09-19T16:00:00.000Z");
  const storage = new MemoryStorage();
  const service = m.createLighthouseControlPortSessionService({
    storage,
    now:() => clock,
    randomUUID:() => "lh-session-board-projection",
    randomSessionToken:() => "device-token-board-projection",
  });

  await service.start({ ttlMs:60_000 });
  const projected = await service.projectCentre({
    ok:true,
    phase:"AWAY",
    workId:"WORK-LIVE-1",
    work:{
      workId:"WORK-LIVE-1",
      status:"AWAY",
      task:"Keep Hub Board current",
      requestedResult:"Hub owns Board projection",
      role:{ roleId:"code-worker" },
    },
    ownership:{ active:true, ownerId:"GO" },
    interruption:null,
    executionCheckpoint:{ latest:{ resumeFrom:"Continue server-side projection" } },
    realityEvidence:null,
    validationEvidence:null,
  });
  assert.equal(projected.ok, true);
  assert.equal(projected.board.revision, 1);
  assert.equal(projected.board.pins[0].status, "DOING");

  clock += 1_000;
  const returned = await service.projectCentre({
    ok:true,
    phase:"RETURNED",
    workId:"WORK-LIVE-1",
    work:{
      workId:"WORK-LIVE-1",
      status:"RETURNED",
      task:"Keep Hub Board current",
      requestedResult:"Hub owns Board projection",
      returnedPayload:{ result:"PASS" },
      role:{ roleId:"code-worker" },
    },
    ownership:{ active:false, ownerId:null },
    interruption:null,
    executionCheckpoint:{ latest:null },
    realityEvidence:{ kind:"DEVICE", reference:"owner.13" },
    validationEvidence:{ kind:"READBACK", reference:"PASS" },
  });
  assert.equal(returned.board.revision, 2);
  assert.equal(returned.board.pins[0].status, "ARCHIVED");
  assert.equal(returned.board.pins[0].result, "PASS");

  await service.start({ deviceLabel:"replacement session", ttlMs:60_000 });
  const afterRestart = await service.boardLatest();
  assert.equal(afterRestart.board.revision, 2);
  assert.equal(afterRestart.board.pins[0].status, "ARCHIVED");
});

test("paired LIGHTHOUSE can read Hub Board but cannot read it with a bad session credential", async () => {
  const m = await load("hub-board-read");
  const service = m.createLighthouseControlPortSessionService({
    storage:new MemoryStorage(),
    now:() => 1_000,
    randomUUID:() => "lh-session-board-read",
    randomSessionToken:() => "device-token-board-read",
  });
  await service.start({ ttlMs:60_000 });
  await service.projectCentre({
    ok:true,
    phase:"AWAY",
    workId:"WORK-READ-1",
    work:{ workId:"WORK-READ-1", status:"AWAY", task:"Read Board", requestedResult:"Projection" },
    ownership:{ active:false },
  });
  const good = await service.board({ sessionId:"lh-session-board-read", sessionToken:"device-token-board-read" });
  assert.equal(good.ok, true);
  assert.equal(good.board.boardId, "BOARD-LIGHTHOUSE-CENTRE");
  assert.equal(good.board.pins[0].workId, "WORK-READ-1");
  assert.equal((await service.board({ sessionId:"lh-session-board-read", sessionToken:"wrong" })).code, "SESSION_INACTIVE");
});


test("V4 terminal and active statuses project to Board without falling back to OPEN", async () => {
  const m = await load("v4-board-status");
  const service = m.createLighthouseControlPortSessionService({
    storage:new MemoryStorage(),
    now:() => Date.parse("2026-09-24T07:00:00Z"),
    randomUUID:() => "lh-session-v4-board",
    randomSessionToken:() => "device-token-v4-board",
  });
  await service.start({ ttlMs:60_000 });
  const base = {
    ok:true, v4:true, phase:"V4", workId:"WORK-V4-BOARD",
    work:{ workId:"WORK-V4-BOARD", name:"V4", command:"smoke", expectedResult:"truth", requestedDestinations:["factory"], holder:null },
    projectBoard:[],
  };
  let projected = await service.projectCentre({ ...base, work:{ ...base.work, status:"CANCEL" } });
  assert.equal(projected.pin.status, "ARCHIVED");
  projected = await service.projectCentre({ ...base, work:{ ...base.work, status:"COMPLETE" } });
  assert.equal(projected.pin.status, "ARCHIVED");
  projected = await service.projectCentre({ ...base, work:{ ...base.work, status:"ON PROCESS", holder:"GO" } });
  assert.equal(projected.pin.status, "DOING");
  projected = await service.projectCentre({ ...base, work:{ ...base.work, status:"WAIT CONFIRM", holder:"GO" } });
  assert.equal(projected.pin.status, "WAIT_CONFIRM");
});
