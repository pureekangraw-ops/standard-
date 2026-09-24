"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const path=require("node:path");
const {pathToFileURL}=require("node:url");
const url=pathToFileURL(path.resolve(__dirname,"..","go-hub-maintenance-state.mjs")).href;
class MemoryStorage{constructor(){this.map=new Map();}async get(k){return this.map.get(k);}async put(k,v){this.map.set(k,structuredClone(v));}}
test("Maintenance durable state persists and reads back map/probe state",async()=>{
  const {GoHubMaintenanceState,createMaintenanceDurableStorage}=await import(url+"?durable="+Date.now());
  const storage=new MemoryStorage();
  const object=new GoHubMaintenanceState({storage});
  const namespace={getByName(name){assert.equal(name,"go-hub-maintenance-v4");return{fetch:req=>object.fetch(req)};}};
  const durable=createMaintenanceDurableStorage({namespace});
  await durable.put("maintenance.v4.state",{revision:3,map:{source:"GO_FIRST_REALITY_RUN",routes:[{id:"r"}]}});
  const read=await durable.get("maintenance.v4.state");
  assert.equal(read.revision,3);
  assert.equal(read.map.routes[0].id,"r");
});
test("Maintenance durable storage refuses missing binding instead of silently falling back to memory",async()=>{
  const {createMaintenanceDurableStorage}=await import(url+"?missing="+Date.now());
  const durable=createMaintenanceDurableStorage({namespace:null});
  await assert.rejects(durable.get("maintenance.v4.state"),/MAINTENANCE_STATE_NOT_CONFIGURED/);
});
