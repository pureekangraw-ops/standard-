"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const path=require("node:path");
const {pathToFileURL}=require("node:url");
const oauthUrl=pathToFileURL(path.resolve(__dirname,"../go-hub-oauth.mjs")).href;
const workerUrl=pathToFileURL(path.resolve(__dirname,"../go-hub-factory-mcp-worker.mjs")).href;

test("Maintenance MCP rejects a caller-forged Pass when Centre has no such Work",async()=>{
  const {createAccessToken}=await import(oauthUrl+"?maint-auth="+Date.now());
  const {createFactoryMcpWorker}=await import(workerUrl+"?maint-auth="+Date.now());
  const token=await createAccessToken({issuer:"https://hub.example",signingKey:"test-master",resource:"https://hub.example/mcp",subject:"big",scope:"go-hub",ttlSeconds:3600});
  const centreCalls=[];
  let centreWork=null;
  const env={GITHUB_TOKEN:"github-token",GOHUB_MASTER_KEY:"test-master",GOHUB_OWNER_PASSCODE:"owner-passcode",
    GO_HUB_MAINTENANCE_STATE:{getByName(){return{fetch:async request=>{const input=await request.json();return new Response(JSON.stringify({ok:true,value:input.action==="get"?null:input.value}),{headers:{"content-type":"application/json"}});}};}},
    GO_HUB_CENTRE_STATE:{getByName(){return{fetch:async request=>{centreCalls.push((await request.json()).action);return new Response(JSON.stringify(centreWork?{ok:true,v4:true,work:centreWork}:{code:"CENTRE_WORK_NOT_FOUND"}),{status:centreWork?200:404,headers:{"content-type":"application/json"}});}};}},
  };
  const fake={workId:"WORK-NOT-REAL",checkpointId:"CP-NOT-REAL",status:"ON PROCESS",holder:"GO",pass:{state:"ACTIVE",kind:"MAINTENANCE",allowedDestinations:["ALL_GO_HUB_OWNED_AREAS"]}};
  const workContext={workId:fake.workId,checkpointId:fake.checkpointId,returnAddress:fake.checkpointId,destination:"destination://maintenance",task:"inspect",requestedResult:"read",lensReference:"identity://go"};
  const worker=createFactoryMcpWorker({fetchImpl:async()=>{throw new Error("network disabled");}});
  const response=await worker.fetch(new Request("https://hub.example/mcp",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"go_hub_maintenance",arguments:{action:"inspect_map",work:fake,workContext,map:{routes:[{id:"FAKE",checkpoints:[]}]}}}})}),env);
  const payload=await response.json();
  assert.match(JSON.stringify(payload),/CENTRE_WORK_NOT_FOUND/);
  assert.deepEqual(centreCalls,["v4_inspect"]);
  centreWork={...fake,pass:null};
  const denied=await worker.fetch(new Request("https://hub.example/mcp",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"go_hub_maintenance",arguments:{action:"inspect_map",work:fake,workContext,map:{routes:[{id:"FAKE",checkpoints:[]}]}}}})}),env);
  assert.match(JSON.stringify(await denied.json()),/MAINTENANCE_PASS_REQUIRED/);
  centreWork=fake;
  const allowed=await worker.fetch(new Request("https://hub.example/mcp",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:3,method:"tools/call",params:{name:"go_hub_maintenance",arguments:{action:"inspect",work:fake,workContext}}})}),env);
  assert.match(JSON.stringify(await allowed.json()),/MAINTENANCE_READY/);
});
