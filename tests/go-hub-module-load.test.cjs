"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {pathToFileURL}=require("node:url");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const load=name=>import(pathToFileURL(path.join(root,name)).href);

test("GO Hub modules parse and export expected factories",async()=>{
  const hub=await load("go-hub-foundation.js");
  const runtime=await load("go-hub-runtime.js");
  const compat=await load("normalpocket-compat.js");
  assert.equal(typeof hub.createHubController,"function");
  assert.equal(typeof runtime.createHubRuntime,"function");
  assert.equal(typeof compat.createNormalPocketPorts,"function");
});

test("Hub controller uses injected ports without mutating caller state",async()=>{
  const {createHubController}=await load("go-hub-foundation.js");
  const original={revision:1,value:1};
  const controller=createHubController({
    state:original,
    applyCommand(state){state.revision+=1; state.value+=1; return state;},
    async commitState({proposed}){return {status:"COMMITTED",revision:proposed.revision};}
  });
  const receipt=await controller.dispatch({type:"INCREMENT"});
  assert.deepEqual(original,{revision:1,value:1});
  assert.deepEqual(controller.getState(),{revision:2,value:2});
  assert.deepEqual(receipt,{status:"COMMITTED",revision:2});
});

test("Hub runtime registry is explicit and rejects duplicate names",async()=>{
  const {createHubRuntime}=await load("go-hub-runtime.js");
  const runtime=createHubRuntime();
  const entry={available:true};
  runtime.register("example",entry);
  assert.equal(runtime.get("example"),entry);
  assert.deepEqual(runtime.list(),[{name:"example",capability:entry}]);
  assert.throws(()=>runtime.register("example",{}),/already registered/);
});
