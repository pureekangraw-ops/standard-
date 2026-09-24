"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const path=require("node:path");
const {pathToFileURL}=require("node:url");
const edgeUrl=pathToFileURL(path.resolve(__dirname,"..","go-hub-edge-worker.mjs")).href;
const serviceUrl=pathToFileURL(path.resolve(__dirname,"..","go-hub-lighthouse-control-port-service.mjs")).href;
async function loadEdge(tag){return import(edgeUrl+"?lh-room-entry="+tag+"-"+Date.now());}

function centreNamespace(work){
  return { getByName(name){ return { async fetch(request){
    const body=JSON.parse(await request.text());
    assert.equal(name,body.workId);
    if(body.action==="v4_inspect") return new Response(JSON.stringify({ok:true,v4:true,work}),{status:200,headers:{"content-type":"application/json"}});
    if(body.action==="v4_return") return new Response(JSON.stringify({ok:true,v4:true,work:{...work,status:"OPEN",holder:null,pass:{...work.pass,state:"CLOSED"}}}),{status:200,headers:{"content-type":"application/json"}});
    return new Response(JSON.stringify({code:"BAD_ACTION"}),{status:400,headers:{"content-type":"application/json"}});
  } }; } };
}
function lighthouseNamespace(){
  return { getByName(){ return { async fetch(request){
    const p=new URL(request.url).pathname;
    if(p==="/latest") return new Response(JSON.stringify({ok:false,code:"SESSION_INACTIVE"}),{status:200,headers:{"content-type":"application/json"}});
    if(p==="/board/latest") return new Response(JSON.stringify({ok:true,board:{revision:7,pins:[],updatedAt:"2026-09-24T02:00:00Z"}}),{status:200,headers:{"content-type":"application/json"}});
    if(p==="/enqueue") return new Response(JSON.stringify({ok:true,queuedAt:"2026-09-24T02:00:00Z"}),{status:200,headers:{"content-type":"application/json"}});
    return new Response(JSON.stringify({ok:true}),{status:200,headers:{"content-type":"application/json"}});
  } }; } };
}
function work({holder="GO",allowed=["lighthouse"]}={}){
  return {workId:"W-LH-ENTRY",name:"LIGHTHOUSE work",command:"inspect app",expectedResult:"verified app",requestedDestinations:["lighthouse"],status:"ON PROCESS",holder,pass:{kind:"WORK",state:"ACTIVE",allowedDestinations:allowed},createdAt:"2026-09-24T01:00:00Z",lastUpdated:"2026-09-24T01:00:00Z",readback:null};
}
function handlerEnv(w){
  return {GO_HUB_CENTRE_STATE:centreNamespace(w),LIGHTHOUSE_CONTROL_PORT_SESSIONS:lighthouseNamespace(),GOHUB_OWNER_PASSCODE:"owner-pass"};
}
function handler(createEdgeWorkerHandler){
  return createEdgeWorkerHandler({delegate:{async fetch(){return new Response("delegate");}},factoryMcp:{async fetch(){return new Response("mcp");}}});
}

test("LIGHTHOUSE owner room refuses entry without Centre Work Pass identity",async()=>{
  const {createEdgeWorkerHandler}=await loadEdge("missing");
  const response=await handler(createEdgeWorkerHandler).fetch(new Request("https://hub.example/hub/lighthouse"),handlerEnv(work()));
  assert.equal(response.status,403);
  assert.equal((await response.json()).code,"LIGHTHOUSE_CENTRE_PASS_REQUIRED");
});

test("LIGHTHOUSE owner room opens only for current holder and authorized pass",async()=>{
  const {createEdgeWorkerHandler}=await loadEdge("allowed");
  const response=await handler(createEdgeWorkerHandler).fetch(new Request("https://hub.example/hub/lighthouse?work_id=W-LH-ENTRY&actor=GO"),handlerEnv(work()));
  assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/LIGHTHOUSE Control Room/);
  assert.match(html,/Return Centre/);
  assert.match(html,/No cross-room Service Path/);
});

test("LIGHTHOUSE room rejects holder mismatch and accepts GO maintenance all-area pass",async()=>{
  const {createEdgeWorkerHandler}=await loadEdge("scope");
  const denied=await handler(createEdgeWorkerHandler).fetch(new Request("https://hub.example/hub/lighthouse?work_id=W-LH-ENTRY&actor=LIGHT"),handlerEnv(work()));
  assert.equal(denied.status,403);
  const maintenance=await handler(createEdgeWorkerHandler).fetch(new Request("https://hub.example/hub/lighthouse?work_id=W-LH-ENTRY&actor=GO"),handlerEnv(work({allowed:["ALL_GO_HUB_OWNED_AREAS"]})));
  assert.equal(maintenance.status,200);
});

test("owner-state and owner-command cannot bypass the Centre Pass",async()=>{
  const {createEdgeWorkerHandler}=await loadEdge("apis");
  const h=handler(createEdgeWorkerHandler);
  const env=handlerEnv(work());
  const denied=await h.fetch(new Request("https://hub.example/hub/api/lighthouse-control-port/owner-state",{method:"POST",headers:{"x-go-owner-passcode":"owner-pass"}}),env);
  assert.equal(denied.status,403);
  const allowed=await h.fetch(new Request("https://hub.example/hub/api/lighthouse-control-port/owner-state?work_id=W-LH-ENTRY&actor=GO",{method:"POST",headers:{"x-go-owner-passcode":"owner-pass"}}),env);
  assert.equal(allowed.status,200);
});

test("rendered room binds owner tools to Work query and Return closes the current Pass to OPEN",async()=>{
  const service=await import(serviceUrl+"?bound-room="+Date.now());
  const html=await (service.lighthouseControlPortOwnerPage()).text();
  assert.match(html,/roomQuery/);
  assert.match(html,/owner-state'\+roomQuery/);
  assert.match(html,/owner-command'\+roomQuery/);
  assert.match(html,/action:'v4_return'/);
  assert.match(html,/status:'OPEN'/);
  assert.match(html,/Returned to Centre\. LIGHTHOUSE Pass closed on the same Work/);
});
