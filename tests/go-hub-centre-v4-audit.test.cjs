"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const path=require("node:path");
const {pathToFileURL}=require("node:url");
const moduleUrl=pathToFileURL(path.resolve(__dirname,"../go-hub-centre-live.mjs")).href;

class MemoryStorage{constructor(map=new Map()){this.map=map}async get(k){return this.map.get(k)}async put(k,v){this.map.set(k,structuredClone(v))}}
function auditNamespace(events){return{getByName(){return{async fetch(request){const body=await request.json();if(body.action==="append"){events.push(body.event);return new Response(JSON.stringify({ok:true,sequence:events.length,event:body.event}),{headers:{"content-type":"application/json"}})}return new Response(JSON.stringify({ok:true,events:[]}),{headers:{"content-type":"application/json"}})}}}}}
async function call(instance,input){const r=await instance.fetch(new Request("https://centre.test/action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(input)}));return{status:r.status,body:await r.json()}}

test("V4 create generates persistent checkpoint identity before global audit",async()=>{
  const {GoHubCentreState}=await import(moduleUrl+"?v4-audit-create="+Date.now());
  const events=[];
  const state=new GoHubCentreState({storage:new MemoryStorage()},{GO_HUB_GLOBAL_AUDIT:auditNamespace(events)});
  const result=await call(state,{action:"v4_create",workId:"WORK-V4-AUDIT",name:"V4 audit",command:"check",expectedResult:"pass",requestedDestinations:["lighthouse"]});
  assert.equal(result.status,200);
  assert.equal(result.body.work.checkpointId,"CP-WORK-V4-AUDIT");
  assert.equal(events.length,1);
  assert.equal(events[0].workId,"WORK-V4-AUDIT");
  assert.equal(events[0].checkpointId,"CP-WORK-V4-AUDIT");
});

test("V4 create binds nested Work to routing identity and rejects a conflicting identity",async()=>{
  const {GoHubCentreState}=await import(moduleUrl+"?v4-routing-id="+Date.now());
  const events=[];
  const state=new GoHubCentreState({storage:new MemoryStorage()},{GO_HUB_GLOBAL_AUDIT:auditNamespace(events)});
  const created=await call(state,{action:"v4_create",workId:"WORK-ROUTE",work:{name:"Nested",command:"check",expectedResult:"same identity"}});
  assert.equal(created.body.work.workId,"WORK-ROUTE");
  assert.equal(events[0].workId,"WORK-ROUTE");
  const other=new GoHubCentreState({storage:new MemoryStorage()},{GO_HUB_GLOBAL_AUDIT:auditNamespace([])});
  const conflict=await call(other,{action:"v4_create",workId:"WORK-ROUTE",work:{workId:"WORK-OTHER",name:"Nested",command:"check",expectedResult:"same identity"}});
  assert.equal(conflict.status,409);
  assert.equal(conflict.body.code,"CENTRE_IDENTITY_CONFLICT");
});

test("V4 load repairs pre-checkpoint Work and pending audit without losing the Work",async()=>{
  const {GoHubCentreState}=await import(moduleUrl+"?v4-audit-repair="+Date.now());
  const events=[];
  const map=new Map();
  map.set("state",{
    v4:true,
    phase:"V4_OPEN",
    work:{workId:"WORK-OLD-V4",name:"old",command:"resume",expectedResult:"same work",requestedDestinations:["lighthouse"],status:"OPEN",holder:null,pass:null,createdAt:"2026-09-24T00:00:00Z",lastUpdated:"2026-09-24T00:00:00Z",readback:null},
    ownership:{revision:0,enforced:false},
    effectLedger:{revision:0,entries:[]},
    executionCheckpoint:{revision:0,latest:null},
    auditPendingEvent:{eventId:"AUDIT-OLD",type:"CENTRE_V4_CREATE",workId:"WORK-OLD-V4",checkpointId:null,phase:"V4_OPEN",targetId:null,at:"2026-09-24T00:00:00Z",details:{}},
  });
  const state=new GoHubCentreState({storage:new MemoryStorage(map)},{GO_HUB_GLOBAL_AUDIT:auditNamespace(events)});
  const result=await call(state,{action:"v4_inspect",workId:"WORK-OLD-V4"});
  assert.equal(result.status,200);
  assert.equal(result.body.work.checkpointId,"CP-WORK-OLD-V4");
  assert.equal(events.length,1);
  assert.equal(events[0].checkpointId,"CP-WORK-OLD-V4");
  const stored=map.get("state");
  assert.equal(stored.auditPendingEvent,null);
  assert.equal(stored.work.checkpointId,"CP-WORK-OLD-V4");
});
