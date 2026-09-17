"use strict";
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const assert=require("node:assert/strict");
const {pathToFileURL}=require("node:url");
const root=path.resolve(__dirname,"..");
const runtimePath=path.join(root,"go-hub-runtime.js");
const runtimeUrl=pathToFileURL(runtimePath).href;
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
test("runtime module exists",()=>assert.equal(fs.existsSync(runtimePath),true));
test("runtime stays neutral",()=>{const s=read("go-hub-runtime.js").toLowerCase(); for(const x of ["normalpocket","metropolis-r5","ygph-standard-secure"]) assert.equal(s.includes(x),false);});
test("runtime exposes registry",()=>{const s=read("go-hub-runtime.js"); assert.match(s,/createHubRuntime/); assert.match(s,/register/); assert.match(s,/list/); assert.match(s,/get/);});

test("V5 Traffic summary uses the canonical common station fields and no routing authority",async()=>{
  const module=await import(runtimeUrl+"?traffic-summary="+Date.now());
  assert.equal(typeof module.createTrafficSummary,"function");
  const summary=module.createTrafficSummary({
    station:"factory",
    status:"BUSY",
    active:1,
    queue:2,
    blocked:true,
    lastUpdate:"2026-09-17T11:00:00Z",
  });
  assert.deepEqual(summary,{
    station:"factory",
    status:"BUSY",
    active:1,
    queue:2,
    blocked:true,
    lastUpdate:"2026-09-17T11:00:00Z",
  });
  assert.throws(()=>module.createTrafficSummary({
    station:"factory",
    status:"WORKING",
    active:1,
    queue:0,
    blocked:false,
    lastUpdate:"2026-09-17T11:00:00Z",
  }),/unsupported traffic status/i);
  for(const key of ["gate","permission","allowedToProceed","nextStation","route"]){
    assert.equal(Object.hasOwn(summary,key),false,`${key} must not exist on Traffic summary`);
  }
  assert.equal(Object.isFrozen(summary),true);
});

test("V5 Traffic snapshot preserves station status, marks stale data STALE, and missing reality UNKNOWN",async()=>{
  const module=await import(runtimeUrl+"?traffic-snapshot="+Date.now());
  assert.equal(typeof module.createTrafficSnapshot,"function");
  const current=module.createTrafficSummary({
    station:"factory",
    status:"BUSY",
    active:1,
    queue:1,
    blocked:true,
    lastUpdate:"2026-09-17T10:55:00Z",
  });
  const stale=module.createTrafficSummary({
    station:"mimir",
    status:"NORMAL",
    active:1,
    queue:0,
    blocked:false,
    lastUpdate:"2026-09-17T10:00:00Z",
  });
  const full=module.createTrafficSummary({
    station:"verification",
    status:"FULL",
    active:2,
    queue:5,
    blocked:false,
    lastUpdate:"2026-09-17T10:58:00Z",
  });
  const snapshot=module.createTrafficSnapshot({
    stations:["factory","mimir","verification","library"],
    summaries:[stale,current,full],
    now:new Date("2026-09-17T11:00:00Z"),
    staleAfterMs:15*60*1000,
  });
  assert.deepEqual(snapshot,[
    {
      station:"factory",
      status:"BUSY",
      active:1,
      queue:1,
      blocked:true,
      lastUpdate:"2026-09-17T10:55:00Z",
    },
    {
      station:"mimir",
      status:"STALE",
      active:1,
      queue:0,
      blocked:false,
      lastUpdate:"2026-09-17T10:00:00Z",
    },
    {
      station:"verification",
      status:"FULL",
      active:2,
      queue:5,
      blocked:false,
      lastUpdate:"2026-09-17T10:58:00Z",
    },
    {
      station:"library",
      status:"UNKNOWN",
      active:null,
      queue:null,
      blocked:null,
      lastUpdate:null,
    },
  ]);
  assert.equal(Object.isFrozen(snapshot),true);
  assert.equal(snapshot.every(item=>Object.isFrozen(item)),true);
  assert.equal(snapshot[2].status,"FULL","a full station must not be rewritten as ERROR");
  for(const item of snapshot){
    for(const key of ["gate","permission","allowedToProceed","nextStation","route"]){
      assert.equal(Object.hasOwn(item,key),false,`${key} must not exist on Traffic snapshot`);
    }
  }
});
