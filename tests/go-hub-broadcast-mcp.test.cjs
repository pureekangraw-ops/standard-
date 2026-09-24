"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const path=require("node:path");
const {pathToFileURL}=require("node:url");

const oauthUrl=pathToFileURL(path.resolve(__dirname,"../go-hub-oauth.mjs")).href;
const workerUrl=pathToFileURL(path.resolve(__dirname,"../go-hub-factory-mcp-worker.mjs")).href;
const broadcastUrl=pathToFileURL(path.resolve(__dirname,"../go-hub-broadcast-state.mjs")).href;

function namespaceFor(state){
  return { getByName(){ return state; } };
}

test("GO changes the broadcast directly and every MCP speaker rejects stale versions",async()=>{
  const {createAccessToken}=await import(oauthUrl+"?broadcast="+Date.now());
  const {createFactoryMcpWorker}=await import(workerUrl+"?broadcast="+Date.now());
  const {GoHubBroadcastState}=await import(broadcastUrl+"?broadcast="+Date.now());
  const values=new Map();
  const state=new GoHubBroadcastState({storage:{
    async get(k){return structuredClone(values.get(k));},
    async put(k,v){values.set(k,structuredClone(v));},
  }});
  const token=await createAccessToken({
    issuer:"https://hub.example",
    signingKey:"test-master",
    resource:"https://hub.example/mcp",
    subject:"big",
    scope:"go-hub",
    ttlSeconds:3600,
  });
  const env={
    GITHUB_TOKEN:"github-token",
    GOHUB_MASTER_KEY:"test-master",
    GOHUB_OWNER_PASSCODE:"owner-passcode",
    GO_HUB_BROADCAST_STATE:namespaceFor(state),
  };
  const worker=createFactoryMcpWorker({fetchImpl:async()=>{throw new Error("network disabled");}});

  async function call(id,name,args={}){
    const response=await worker.fetch(new Request("https://hub.example/mcp",{
      method:"POST",
      headers:{authorization:"Bearer "+token,"content-type":"application/json"},
      body:JSON.stringify({jsonrpc:"2.0",id,method:"tools/call",params:{name,arguments:args}}),
    }),env);
    assert.equal(response.status,200);
    const payload=await response.json();
    assert.equal(payload.error,undefined);
    return payload.result;
  }

  const boot=await call(1,"go_hub_broadcast_read");
  assert.equal(JSON.parse(boot.content[0].text).broadcast.version,"V4");

  const changed=await call(2,"go_hub_broadcast_activate",{
    program:"GO_HUB_SYSTEM",version:"V5",hash:"hash-v5",sourceRef:"owner://go-hub/v5",
  });
  assert.equal(JSON.parse(changed.content[0].text).broadcast.version,"V5");

  const stale=await call(3,"go_hub_centre_read_only_fast_lane",{
    purpose:"READ_TELL",
    operations:["READ"],
    broadcast:{program:"GO_HUB_SYSTEM",version:"V4",hash:"bc9d1a138773c7884b2eee2d7c40877b2cad52f9"},
  });
  const staleBody=JSON.parse(stale.content[0].text);
  assert.equal(stale.isError,true);
  assert.equal(staleBody.code,"BROADCAST_MISMATCH");
  assert.equal(staleBody.next,"MAINTENANCE_RUNNER");
  assert.equal(staleBody.expected.version,"V5");

  const current=await call(4,"go_hub_centre_read_only_fast_lane",{
    purpose:"READ_TELL",
    operations:["READ"],
    broadcast:{program:"GO_HUB_SYSTEM",version:"V5",hash:"hash-v5"},
  });
  assert.equal(current.isError,undefined);
  assert.equal(current.structuredContent.broadcastReadback.version,"V5");
  assert.equal(current.structuredContent.broadcastReadback.hash,"hash-v5");
});
