"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const path=require("node:path");
const{pathToFileURL}=require("node:url");

const root=path.resolve(__dirname,"..");
const sessionUrl=pathToFileURL(path.join(root,"go-hub-browser-observer-session.js")).href;

class MemoryStorage{
  constructor(){this.map=new Map()}
  async get(k){return this.map.get(k)}
  async put(k,v){this.map.set(k,v)}
  async delete(k){this.map.delete(k)}
}

async function load(tag){return import(`${sessionUrl}?firefox-eye=${tag}-${Date.now()}`)}
function capture(id,{origin="https://example.com",title="Example"}={}){
  return{
    schema_version:"go-firefox-eye-latest-v1",
    capture_id:id,
    captured_at:new Date(2500).toISOString(),
    origin,
    sanitized_path:"/demo",
    page_title:title,
    viewport:{width:390,height:844},
    page_fingerprint:`eye:${id}`,
    visible_landmarks:["main"],
    visible_text_snippets:["Current visible page"],
    interactive_elements:[{role:"button",label:"Continue"}],
    redaction_report:{sensitive_blocked:0,unknown_redacted:0,hidden_omitted:0},
    image_data_url:"data:image/jpeg;base64,AA==",
  };
}

test("Firefox Eye latest slot atomically replaces the previous capture and keeps image with matching context",async()=>{
  const m=await load("replace");
  const storage=new MemoryStorage();
  const service=m.createObserverSessionService({storage,now:()=>2500,randomUUID:()=>"session-1",randomToken:()=>"token-1"});
  await service.start({ttlMs:600000});
  assert.equal((await service.storeFirefoxLatest({sessionId:"session-1",sessionToken:"token-1",capture:capture("cap-1")})).ok,true);
  assert.equal((await service.storeFirefoxLatest({sessionId:"session-1",sessionToken:"token-1",capture:capture("cap-2",{origin:"https://mozilla.org",title:"Mozilla"})})).ok,true);
  const latest=await service.latestFirefox();
  assert.equal(latest.ok,true);
  assert.equal(latest.capture.capture_id,"cap-2");
  assert.equal(latest.capture.origin,"https://mozilla.org");
  assert.equal(latest.capture.page_title,"Mozilla");
  assert.equal(latest.capture.image_data_url,"data:image/jpeg;base64,AA==");
  assert.equal(storage.map.has("firefox:capture:cap-1"),false);
  assert.equal(storage.map.has("firefox:capture:cap-2"),false);
  assert.deepEqual(await storage.get("firefox:latest"),latest.capture);
});
