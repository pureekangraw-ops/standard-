"use strict";
const test=require("node:test"); const assert=require("node:assert/strict"); const path=require("node:path"); const {pathToFileURL}=require("node:url");
const workerUrl=pathToFileURL(path.resolve(__dirname,"../go-hub-factory-mcp-worker.mjs")).href;
test("Factory guarded lifecycle produces an exact-head Ready Gate before assembly admission",async()=>{
 const {createFactoryGuardedLifecycle}=await import(workerUrl+"?ready="+Date.now());
 const lifecycle={}; const factory={foreman(){throw new Error("not used")},assertActiveMerge(){throw new Error("not used")}};
 const guarded=createFactoryGuardedLifecycle({lifecycle,factory});
 const head="head-ci-pass";
 const response=await guarded.factoryReadyGate({
  workPackage:{id:"wp-ci",blueprintRef:"blueprint://factory",inputs:["PR CI"],dependencies:[],assemblyTarget:"standard/main"},
  piece:{id:"piece-ci",workPackageId:"wp-ci",repository:"pureekangraw-ops/standard-",branch:"work/test",headSha:head,changedPaths:["x.js"],outputs:["tested code"]},
  blueprint:{ref:"blueprint://factory"},
  pieceQc:{status:"pass",checkedHeadSha:head,evidenceIds:["ci-1"]},
  evidence:[{id:"ci-1",scope:"piece",headSha:head,kind:"STANDARD_SAFETY_GATE",status:"success"}],
 });
 const body=await response.json(); assert.equal(response.status,200); assert.equal(body.readyGate.status,"READY_FOR_ASSEMBLY"); assert.equal(body.readyGate.headSha,head);
});
test("Ready Gate producer rejects stale QC head",async()=>{
 const {createFactoryGuardedLifecycle}=await import(workerUrl+"?stale="+Date.now());
 const guarded=createFactoryGuardedLifecycle({lifecycle:{},factory:{foreman(){},assertActiveMerge(){}}});
 const response=await guarded.factoryReadyGate({workPackage:{id:"wp",blueprintRef:"bp",assemblyTarget:"main"},piece:{id:"p",workPackageId:"wp",repository:"r",branch:"b",headSha:"new"},blueprint:{ref:"bp"},pieceQc:{status:"pass",checkedHeadSha:"old",evidenceIds:["e"]},evidence:[{id:"e",scope:"piece",headSha:"new"}]});
 assert.equal(response.status,409); const body=await response.json(); assert.equal(body.code,"READY_GATE_REJECTED");
});