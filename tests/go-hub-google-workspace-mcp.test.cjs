"use strict";
const test=require("node:test"), assert=require("node:assert/strict"), path=require("node:path");
const {pathToFileURL}=require("node:url"); const root=path.resolve(__dirname,"..");
const serviceUrl=pathToFileURL(path.join(root,"go-hub-google-workspace-service.mjs")).href;
const registryUrl=pathToFileURL(path.join(root,"go-hub-mcp-registry.mjs")).href;
test("registry publishes governed Gmail and Calendar tools",async()=>{
 const {createMcpRegistry}=await import(registryUrl+"?workspace="+Date.now());
 const lifecycle=new Proxy({}, {get:(_,name)=>async input=>new Response(JSON.stringify({operation:name,input}),{headers:{"content-type":"application/json"}})});
 const registry=createMcpRegistry({lifecycle}); const names=registry.listTools().map(x=>x.name);
 for(const name of ["go_hub_gmail_profile","go_hub_gmail_search","go_hub_gmail_get_message","go_hub_gmail_send_message","go_hub_calendar_list","go_hub_calendar_events","go_hub_calendar_create_event"]) assert.ok(names.includes(name),name);
 await assert.rejects(registry.callTool("go_hub_gmail_send_message",{to:"a@example.com",subject:"s",body:"b",workContext:{workId:"W",checkpointId:"C",returnAddress:"C",destination:"destination://factory",task:"t",requestedResult:"r",lensReference:"l"}}),/destination/i);
});
test("workspace service refreshes once and does not expose credentials",async()=>{
 const {createGoogleWorkspaceService}=await import(serviceUrl+"?service="+Date.now()); const calls=[];
 const fetchImpl=async(url,init={})=>{calls.push({url:String(url),init});
  if(String(url).includes("oauth2.googleapis.com/token")) return new Response(JSON.stringify({access_token:"fresh-secret",scope:"https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly"}),{headers:{"content-type":"application/json"}});
  if(String(url).endsWith("/gmail/v1/users/me/profile")) return new Response(JSON.stringify({emailAddress:"owner@example.com",messagesTotal:2,threadsTotal:1}),{headers:{"content-type":"application/json"}});
  throw new Error("unexpected "+url);
 };
 const svc=createGoogleWorkspaceService({fetchImpl,refreshToken:"refresh-secret",clientId:"client-id",clientSecret:"client-secret"});
 const response=await svc.gmailProfile(), payload=await response.json(); assert.equal(payload.profile.emailAddress,"owner@example.com"); assert.equal(calls.length,2);
 assert.doesNotMatch(JSON.stringify(payload),/fresh-secret|refresh-secret|client-secret/);
});
test("gmail send and calendar create use expected Google endpoints",async()=>{
 const {createGoogleWorkspaceService}=await import(serviceUrl+"?mut="+Date.now()); const calls=[];
 const fetchImpl=async(url,init={})=>{calls.push({url:String(url),init});
  if(String(url).includes("/messages/send")) return new Response(JSON.stringify({id:"m1",threadId:"t1"}),{headers:{"content-type":"application/json"}});
  if(String(url).includes("/calendar/v3/calendars/primary/events")) return new Response(JSON.stringify({id:"e1",summary:"Run"}),{headers:{"content-type":"application/json"}});
  throw new Error("unexpected "+url);
 };
 const svc=createGoogleWorkspaceService({fetchImpl,accessToken:"access-secret"});
 assert.equal((await (await svc.gmailSendMessage({to:"a@example.com",subject:"Hi",body:"Body"})).json()).message.id,"m1");
 assert.equal((await (await svc.calendarCreateEvent({summary:"Run",start:{dateTime:"2026-09-23T09:00:00+07:00"},end:{dateTime:"2026-09-23T10:00:00+07:00"}})).json()).event.id,"e1");
 assert.equal(calls.length,2); for(const call of calls) assert.equal(call.init.headers.authorization,"Bearer access-secret");
});
