"use strict";
const test=require("node:test"), assert=require("node:assert/strict"), path=require("node:path");
const {pathToFileURL}=require("node:url"); const root=path.resolve(__dirname,"..");
const serviceUrl=pathToFileURL(path.join(root,"go-hub-google-workspace-service.mjs")).href;
const registryUrl=pathToFileURL(path.join(root,"go-hub-mcp-registry.mjs")).href;
test("registry publishes governed Gmail and Calendar tools",async()=>{
 const {createMcpRegistry}=await import(registryUrl+"?workspace="+Date.now());
 const lifecycle=new Proxy({}, {get:(_,name)=>async input=>new Response(JSON.stringify({operation:name,input}),{headers:{"content-type":"application/json"}})});
 const registry=createMcpRegistry({lifecycle}); const tools=registry.listTools(), names=tools.map(x=>x.name);
 for(const name of ["go_hub_gmail_profile","go_hub_gmail_search","go_hub_gmail_get_message","go_hub_gmail_send_message","go_hub_calendar_list","go_hub_calendar_events","go_hub_calendar_create_event"]) assert.ok(names.includes(name),name);
 const gmailSend=tools.find(x=>x.name==="go_hub_gmail_send_message");
 assert.equal(gmailSend.inputSchema.properties.attachments.maxItems,5);
 assert.equal(gmailSend.inputSchema.properties.driveAttachments.maxItems,5);
 assert.ok(gmailSend.inputSchema.properties.threadId);
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
 const driveService={readFileBytes:async({fileId})=>({item:{id:fileId,name:"drive-proof.png",mimeType:"image/png"},bytes:new Uint8Array([104,105])})};
 const svc=createGoogleWorkspaceService({fetchImpl,accessToken:"access-secret",driveService});
 const sent=await (await svc.gmailSendMessage({
  to:"a@example.com",subject:"Re: Hi",body:"Body",threadId:"thread-support",
  inReplyTo:"<latest@example.com>",references:"<older@example.com> <latest@example.com>",
  attachments:[{filename:"proof.jpg",mimeType:"image/jpeg",contentBase64:"aGVsbG8="}],
  driveAttachments:[{fileId:"drive-1"}],
 })).json();
 assert.equal(sent.message.id,"m1"); assert.equal(sent.attachmentCount,2); assert.equal(sent.driveAttachmentCount,1); assert.equal(sent.attachmentBytes,7);
 const gmailPayload=JSON.parse(calls[0].init.body); assert.equal(gmailPayload.threadId,"thread-support");
 const padded=gmailPayload.raw.replace(/-/g,"+").replace(/_/g,"/") + "=".repeat((4-gmailPayload.raw.length%4)%4);
 const mime=Buffer.from(padded,"base64").toString("utf8");
 assert.match(mime,/Content-Type: multipart\/mixed/); assert.match(mime,/In-Reply-To: <latest@example\.com>/);
 assert.match(mime,/Content-Disposition: attachment; filename="proof\.jpg"/); assert.match(mime,/aGVsbG8=/);
 assert.match(mime,/Content-Disposition: attachment; filename="drive-proof\.png"/); assert.match(mime,/aGk=/);
 assert.equal((await (await svc.calendarCreateEvent({summary:"Run",start:{dateTime:"2026-09-23T09:00:00+07:00"},end:{dateTime:"2026-09-23T10:00:00+07:00"}})).json()).event.id,"e1");
 assert.equal(calls.length,2); for(const call of calls) assert.equal(call.init.headers.authorization,"Bearer access-secret");
});

test("gmail attachment limits reject invalid payload before network",async()=>{
 const {createGoogleWorkspaceService}=await import(serviceUrl+"?limits="+Date.now()); let calls=0;
 const svc=createGoogleWorkspaceService({fetchImpl:async()=>{calls++;throw new Error("network should not be called");},accessToken:"access-secret"});
 const tooMany=Array.from({length:6},(_,i)=>({filename:"p"+i+".jpg",mimeType:"image/jpeg",contentBase64:"aA=="}));
 const response=await svc.gmailSendMessage({to:"a@example.com",subject:"Hi",body:"Body",attachments:tooMany});
 assert.equal(response.status,400); assert.equal(calls,0);
});
