"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-centre-reconciliation.mjs")).href;
const sessionUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-lighthouse-control-port-session.js")).href;

class MemoryStorage {
  constructor(initial = null) {
    this.map = new Map(initial ? [["state", structuredClone(initial)]] : []);
    this.alarms = [];
    this.alarm = null;
    this.deletedAlarms = 0;
  }
  async get(key) { return this.map.get(key); }
  async put(key, value) { this.map.set(key, structuredClone(value)); }
  async setAlarm(timestamp) {
    this.alarm = Number(timestamp);
    this.alarms.push(this.alarm);
  }
  async getAlarm() { return this.alarm; }
  async deleteAlarm() {
    this.alarm = null;
    this.deletedAlarms += 1;
  }
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function activeState(cursor = 0) {
  return {
    schema:1,
    session:{ active:true, expiresAt:100_000, sessionId:"lh-1" },
    commands:{},
    receipts:{},
    latest:null,
    reconciliation:{ cursor, lastRunAt:null, lastError:null, lastProcessedWorkIds:[] },
  };
}

test("reconciliation advances cursor, filters CENTRE events, and merges duplicate Work IDs", async () => {
  const { createCentreReconciliationService } = await import(moduleUrl + "?filter=" + Date.now());
  const storage = new MemoryStorage(activeState(4));
  const inspected = [];
  const projected = [];
  const service = createCentreReconciliationService({
    storage,
    now:() => 50_000,
    audit:{
      async history(input) {
        assert.deepEqual(input, { afterSequence:4, limit:100 });
        return response({
          ok:true,
          lastSequence:9,
          events:[
            { sequence:5, event:{ type:"CENTRE_START", workId:"WORK-A" } },
            { sequence:6, event:{ type:"OTHER_EVENT", workId:"WORK-B" } },
            { sequence:7, event:{ type:"CENTRE_REVIEW", workId:"WORK-A" } },
            { sequence:8, event:{ type:"CENTRE_RETURN", workId:"WORK-B" } },
          ],
        });
      },
    },
    centreNamespace:{
      getByName(workId) {
        return {
          async fetch(request) {
            const body = await request.json();
            inspected.push({ workId, body });
            return response({
              ok:true,
              workId,
              phase:"AWAY",
              work:{ workId, status:"AWAY", task:"Reconcile " + workId, requestedResult:"Project truth" },
            });
          },
        };
      },
    },
    projectCentre:async view => {
      projected.push(view.workId);
      return { ok:true, changed:false };
    },
  });

  const result = await service.reconcile();
  assert.equal(result.ok, true);
  assert.deepEqual(result.processedWorkIds, ["WORK-A", "WORK-B"]);
  assert.deepEqual(projected, ["WORK-A", "WORK-B"]);
  assert.deepEqual(inspected.map(item => item.body), [
    { action:"v4_inspect", workId:"WORK-A" },
    { action:"v4_inspect", workId:"WORK-B" },
  ]);
  assert.equal((await storage.get("state")).reconciliation.cursor, 9);
});

test("failed reconciliation preserves cursor and retries the same audit window", async () => {
  const { createCentreReconciliationService } = await import(moduleUrl + "?retry=" + Date.now());
  const storage = new MemoryStorage(activeState(2));
  let attempts = 0;
  const service = createCentreReconciliationService({
    storage,
    now:() => 50_000,
    audit:{
      async history() {
        attempts += 1;
        return response({
          ok:true,
          lastSequence:3,
          events:[{ sequence:3, event:{ type:"CENTRE_REVIEW", workId:"WORK-RETRY" } }],
        });
      },
    },
    centreNamespace:{
      getByName() {
        return {
          async fetch() {
            return response({ ok:true, workId:"WORK-RETRY", phase:"AWAY", work:{
              workId:"WORK-RETRY", status:"AWAY", task:"Retry", requestedResult:"Retry safely",
            } });
          },
        };
      },
    },
    projectCentre:async () => {
      if (attempts === 1) throw new Error("PROJECT_TEMPORARY_FAILURE");
      return { ok:true, changed:false };
    },
  });

  const first = await service.reconcile();
  assert.equal(first.ok, false);
  assert.equal((await storage.get("state")).reconciliation.cursor, 2);
  assert.equal((await storage.get("state")).reconciliation.lastError, "PROJECT_TEMPORARY_FAILURE");

  const second = await service.reconcile();
  assert.equal(second.ok, true);
  assert.equal((await storage.get("state")).reconciliation.cursor, 3);
  assert.equal((await storage.get("state")).reconciliation.lastError, null);
});

test("existing Lighthouse Durable Object schedules alarms only for active LIGHT sessions", async () => {
  const m = await import(sessionUrl + "?alarm=" + Date.now());
  const storage = new MemoryStorage();
  const registry = new m.LighthouseControlPortSessionRegistry({ storage }, {
    GO_HUB_GLOBAL_AUDIT:{
      getByName() {
        return {
          async fetch() {
            return response({ ok:true, lastSequence:0, events:[] });
          },
        };
      },
    },
    GO_HUB_CENTRE_STATE:{ getByName() { throw new Error("should not inspect without events"); } },
  });

  const started = await registry.fetch(new Request("https://lighthouse-control-port.internal/start", {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body:JSON.stringify({ deviceLabel:"LIGHT", ttlMs:60_000 }),
  }));
  const session = await started.json();
  assert.equal(started.status, 200);
  assert.equal(storage.alarms.length, 1);

  const alarmResult = await registry.alarm();
  assert.equal(alarmResult.ok, true);
  assert.equal(alarmResult.active, true);
  assert.equal(storage.alarms.length, 2);

  const stopped = await registry.fetch(new Request("https://lighthouse-control-port.internal/stop", {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body:JSON.stringify({ sessionId:session.session_id, sessionToken:session.session_token }),
  }));
  assert.equal((await stopped.json()).ok, true);
  assert.equal(storage.deletedAlarms, 1);
});

test("Centre Board projection is idempotent when reconciliation sees the same truth again", async () => {
  const m = await import(sessionUrl + "?idempotency=" + Date.now());
  const storage = new MemoryStorage();
  const service = m.createLighthouseControlPortSessionService({
    storage,
    now:() => 50_000,
    randomUUID:() => "lh-idempotent",
    randomSessionToken:() => "token-idempotent",
  });
  await service.start({ ttlMs:60_000 });
  const view = {
    ok:true,
    phase:"AWAY",
    workId:"WORK-IDEMPOTENT",
    work:{
      workId:"WORK-IDEMPOTENT",
      status:"AWAY",
      task:"Idempotent projection",
      requestedResult:"One board revision",
    },
    ownership:{ active:false },
    interruption:null,
    executionCheckpoint:{ latest:null },
    realityEvidence:null,
    validationEvidence:null,
  };

  const first = await service.projectCentre(view);
  const second = await service.projectCentre(view);
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(second.board.revision, 1);
});

test("deployed service re-arms an active pre-existing LIGHT session without rotating the session", async () => {
  const m = await import(sessionUrl + "?migration=" + Date.now());
  const state = activeState(0);
  state.session.expiresAt = Date.now() + 60_000;
  const storage = new MemoryStorage(state);
  const registry = new m.LighthouseControlPortSessionRegistry({ storage }, {});

  const first = await registry.fetch(new Request("https://lighthouse-control-port.internal/latest", {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body:"{}",
  }));
  const firstBody = await first.json();
  assert.equal(firstBody.ok, true);
  assert.equal(storage.alarms.length, 1);
  assert.equal((await storage.get("state")).session.sessionId, "lh-1");

  const second = await registry.fetch(new Request("https://lighthouse-control-port.internal/latest", {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body:"{}",
  }));
  assert.equal((await second.json()).ok, true);
  assert.equal(storage.alarms.length, 1);
});


test("reconciliation prefers V4 inspect and falls back only for legacy Centre work", async () => {
  const { createCentreReconciliationService } = await import(moduleUrl + "?compat=" + Date.now());
  const storage = new MemoryStorage(activeState(0));
  const actions = [];
  const service = createCentreReconciliationService({
    storage,
    now:() => 50_000,
    audit:{ async history(){ return response({ ok:true, lastSequence:1, events:[{ sequence:1, event:{ type:"CENTRE_REVIEW", workId:"WORK-LEGACY" } }] }); } },
    centreNamespace:{
      getByName(workId) {
        return { async fetch(request) {
          const body = await request.json();
          actions.push(body.action);
          if (body.action === "v4_inspect") return response({ code:"unsupported Centre live action" }, 400);
          return response({ ok:true, workId, checkpointId:"CP-LEGACY", phase:"REVIEW", work:{ workId, status:"READY", task:"Legacy", requestedResult:"Remain readable" } });
        }};
      },
    },
    projectCentre:async () => ({ ok:true, changed:true }),
  });
  const result = await service.reconcile();
  assert.equal(result.ok, true);
  assert.deepEqual(actions, ["v4_inspect", "inspect"]);
});


test("Board truth reconciliation can run without an active LIGHT session", async () => {
  const { createCentreReconciliationService } = await import(moduleUrl + "?board-read=" + Date.now());
  const state = activeState(0);
  state.session = { active:false, expiresAt:0 };
  const storage = new MemoryStorage(state);
  const projected = [];
  const service = createCentreReconciliationService({
    storage,
    requireActiveSession:false,
    now:() => 50_000,
    audit:{ async history(){ return response({ ok:true, lastSequence:7, events:[{ sequence:7, event:{ type:"CENTRE_V4_RETURN", workId:"WORK-CANCELLED" } }] }); } },
    centreNamespace:{
      getByName(workId) {
        return { async fetch(request) {
          const body = await request.json();
          assert.equal(body.action, "v4_inspect");
          return response({ ok:true, v4:true, work:{ workId, checkpointId:"CP-WORK-CANCELLED", name:"done", command:"smoke", expectedResult:"closed", requestedDestinations:["factory"], status:"CANCEL", holder:null, pass:null, createdAt:"2026-09-24T00:00:00Z", lastUpdated:"2026-09-24T00:01:00Z" } });
        }};
      },
    },
    projectCentre:async view => { projected.push(view.work.status); return { ok:true, changed:true }; },
  });
  const result = await service.reconcile();
  assert.equal(result.ok, true);
  assert.equal(result.active, false);
  assert.deepEqual(result.processedWorkIds, ["WORK-CANCELLED"]);
  assert.deepEqual(projected, ["CANCEL"]);
});

test("reconciliation preserves routing Work identity for V4 and skips stale canonical Board seeds",async()=>{
  const {createCentreReconciliationService}=await import(moduleUrl+"?routing-seam="+Date.now());
  const state=activeState(0);state.session={active:false,expiresAt:0};
  const storage=new MemoryStorage(state);
  const projected=[];
  const service=createCentreReconciliationService({
    storage,requireActiveSession:false,now:()=>50_000,seedWorkIds:["WORK-CANONICAL-STALE"],
    audit:{async history(){return response({ok:true,lastSequence:1,events:[{sequence:1,event:{type:"CENTRE_V4_CLAIM",workId:"WORK-ROUTING"}}]});}},
    centreNamespace:{
      getByName(workId){return{async fetch(){
        if(workId==="WORK-CANONICAL-STALE")return response({code:"CENTRE_WORK_NOT_FOUND"},404);
        return response({ok:true,v4:true,work:{workId:"WORK-CANONICAL",checkpointId:"CP-CANON",name:"V4",command:"test",expectedResult:"truth",requestedDestinations:["maintenance"],status:"ON PROCESS",holder:"GO",pass:null,createdAt:"2026-09-24T00:00:00Z",lastUpdated:"2026-09-24T00:00:01Z"}});
      }};}
    },
    projectCentre:async view=>{projected.push(view);return{ok:true,changed:true};},
  });
  const result=await service.reconcile();
  assert.equal(result.ok,true);
  assert.deepEqual(result.processedWorkIds,["WORK-ROUTING"]);
  assert.deepEqual(result.skippedWorkIds,[{workId:"WORK-CANONICAL-STALE",reason:"STALE_BOARD_SEED"}]);
  assert.equal(projected[0].routingWorkId,"WORK-ROUTING");
  assert.equal(projected[0].canonicalWorkId,"WORK-CANONICAL");
});
test("Centre Board projection migrates an old canonical pin to routing identity without duplicating it",async()=>{
  const m=await import(sessionUrl+"?routing-pin="+Date.now());
  const storage=new MemoryStorage();
  const service=m.createLighthouseControlPortSessionService({storage,now:()=>50_000,randomUUID:()=>"lh-route",randomSessionToken:()=>"token-route"});
  await service.start({ttlMs:60_000});
  const oldView={ok:true,phase:"AWAY",work:{workId:"WORK-CANON",status:"AWAY",task:"Old pin",requestedResult:"truth"},ownership:{active:false}};
  await service.projectCentre(oldView);
  const migrated=await service.projectCentre({...oldView,routingWorkId:"WORK-ROUTE",canonicalWorkId:"WORK-CANON"});
  assert.equal(migrated.board.pins.length,1);
  assert.equal(migrated.board.pins[0].workId,"WORK-ROUTE");
  assert.equal(migrated.board.pins[0].canonicalWorkId,"WORK-CANON");
});

