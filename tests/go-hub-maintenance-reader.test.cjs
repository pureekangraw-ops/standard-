"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const path=require("node:path");
const {pathToFileURL}=require("node:url");
const url=pathToFileURL(path.resolve(__dirname,"..","go-hub-maintenance-reader.mjs")).href;
function response(body,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});}
test("Maintenance reality reader covers bindings, source files, MCP tools and canonical routes without exposing secrets",async()=>{
  const {createMaintenanceRealityReader}=await import(url+"?core="+Date.now());
  const reader=createMaintenanceRealityReader({
    env:{GO_HUB_GLOBAL_AUDIT:{},GOHUB_MASTER_KEY:"super-secret"},
    lifecycle:{readFile:async()=>response({content:"PLAN BUILD ASSEMBLY MERGE CHECK OUTPUT",sha:"abc"})},
    registryRef:()=>({listTools:()=>[{name:"go_hub_board_read"}]}),
  });
  const binding=await reader({source:"binding:GO_HUB_GLOBAL_AUDIT",expected:true});
  assert.equal(binding.value,true);
  const secret=await reader({source:"config:GOHUB_MASTER_KEY",expected:true});
  assert.equal(secret.value,true);
  assert.equal(JSON.stringify(secret).includes("super-secret"),false);
  const file=await reader({source:"source:go-hub-factory-v4.js",expected:{contains:["PLAN","OUTPUT"]}});
  assert.deepEqual(file.value,["PLAN","OUTPUT"]);
  assert.match(file.evidenceRef,/github:\/\//);
  const tool=await reader({source:"tool:go_hub_board_read",expected:true});
  assert.equal(tool.value,true);
  const route=await reader({source:"destination:\/\/maintenance",expected:true});
  assert.equal(route.value,true);
});
test("Maintenance reality reader reports unsupported sources as UNKNOWN-capable reader gaps instead of guessing",async()=>{
  const {createMaintenanceRealityReader}=await import(url+"?unknown="+Date.now());
  const reader=createMaintenanceRealityReader({});
  const result=await reader({source:"provider-internal:magic",expected:true});
  assert.equal(result.available,false);
  assert.equal(result.reason,"MAINTENANCE_READER_UNAVAILABLE");
});

test("Maintenance reality reader can inspect the GO Hub broadcast station without changing the inspection map",async()=>{
  const {createMaintenanceRealityReader}=await import(url+"?broadcast="+Date.now());
  const broadcast={
    current:async()=>response({ok:true,broadcast:{program:"GO_HUB_SYSTEM",version:"V5",hash:"h5",sourceRef:"owner://v5"}}),
  };
  const reader=createMaintenanceRealityReader({
    env:{GO_HUB_BROADCAST_STATE:{}},
    broadcast,
  });
  const binding=await reader({source:"binding:GO_HUB_BROADCAST_STATE",expected:true});
  assert.equal(binding.value,true);
  const current=await reader({source:"broadcast:current",expected:"V5"});
  assert.equal(current.available,true);
  assert.equal(current.value,"V5");
  assert.equal(current.evidenceRef,"service://broadcast-current");
});
