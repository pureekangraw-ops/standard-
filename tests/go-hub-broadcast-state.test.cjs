"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const path=require("node:path");
const {pathToFileURL}=require("node:url");
const url=pathToFileURL(path.resolve(__dirname,"../go-hub-broadcast-state.mjs")).href;

function ctx(){
  const values=new Map();
  return {storage:{
    async get(key){return structuredClone(values.get(key));},
    async put(key,value){values.set(key,structuredClone(value));},
  }};
}

test("GO Hub broadcast boots on V4 and GO can atomically change the current plate",async()=>{
  const {GoHubBroadcastState}=await import(url+"?state="+Date.now());
  const state=new GoHubBroadcastState(ctx());
  const first=await state.fetch(new Request("https://hub/broadcast",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"current"})}));
  const boot=await first.json();
  assert.equal(boot.broadcast.version,"V4");
  const denied=await state.fetch(new Request("https://hub/broadcast",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"activate",actor:"LIGHT",program:"GO_HUB_SYSTEM",version:"V5",hash:"h5",sourceRef:"owner://v5"})}));
  assert.equal(denied.status,403);
  assert.match(JSON.stringify(await denied.json()),/BROADCAST_GO_ONLY/);
  const changed=await state.fetch(new Request("https://hub/broadcast",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"activate",actor:"GO",program:"GO_HUB_SYSTEM",version:"V5",hash:"h5",sourceRef:"owner://v5"})}));
  assert.equal(changed.status,200);
  assert.equal((await changed.json()).broadcast.version,"V5");
  const readback=await state.fetch(new Request("https://hub/broadcast",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"current"})}));
  assert.deepEqual((await readback.json()).broadcast.hash,"h5");
});

test("speaker locks to broadcast and sends stray versions to Maintenance Runner",async()=>{
  const {compareBroadcast}=await import(url+"?speaker="+Date.now());
  const current={program:"GO_HUB_SYSTEM",version:"V4",hash:"abc",sourceRef:"owner://v4"};
  assert.equal(compareBroadcast(current,null,{area:"factory"}).status,"BROADCAST_LOCKED");
  assert.equal(compareBroadcast(current,{program:"GO_HUB_SYSTEM",version:"V4",hash:"abc"},{area:"centre"}).ok,true);
  const stale=compareBroadcast(current,{program:"GO_HUB_SYSTEM",version:"V3",hash:"old"},{area:"light"});
  assert.equal(stale.ok,false);
  assert.equal(stale.code,"BROADCAST_MISMATCH");
  assert.equal(stale.next,"MAINTENANCE_RUNNER");
  assert.equal(stale.expected.version,"V4");
  assert.equal(stale.observed.version,"V3");
});
