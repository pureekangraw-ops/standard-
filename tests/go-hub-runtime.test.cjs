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

test("V5 Traffic summary is a small read-only station observation, not routing authority",async()=>{
  const module=await import(runtimeUrl+"?traffic-summary="+Date.now());
  assert.equal(typeof module.createTrafficSummary,"function");
  const summary=module.createTrafficSummary({
    station:"factory",
    activity:"assembling PR #76",
    queue:2,
    blocker:"merge lane busy",
    updatedAt:"2026-09-17T11:00:00Z",
  });
  assert.deepEqual(summary,{
    station:"factory",
    activity:"assembling PR #76",
    queue:2,
    blocker:"merge lane busy",
    updatedAt:"2026-09-17T11:00:00Z",
  });
  for(const key of ["gate","permission","allowedToProceed","nextStation","route"]){
    assert.equal(Object.hasOwn(summary,key),false,`${key} must not exist on Traffic summary`);
  }
  assert.equal(Object.isFrozen(summary),true);
});
