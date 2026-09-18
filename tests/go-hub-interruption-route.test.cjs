"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const path=require("node:path");
const {pathToFileURL}=require("node:url");

const root=path.resolve(__dirname,"..");
const routeUrl=pathToFileURL(path.join(root,"go-hub-city-route.js")).href;
const centreUrl=pathToFileURL(path.join(root,"go-hub-centre.js")).href;

test("post-Reality cancel returns to Centre as recovery and cannot exit through Bifrost",async()=>{
  const route=await import(routeUrl);
  const returned=route.routeInterruptionReturn({requested:"CANCEL",merged:true});
  assert.equal(returned.destination,"centre");
  assert.equal(returned.interruption.state,"RECOVERY_REQUIRED");
  assert.equal(returned.interruption.cancellable,false);
  const next=route.routeInterruptionFromCentre({interruption:returned.interruption,heimdall:{decision:"PASS"}});
  assert.equal(next.destination,"go-work-loop");
  assert.equal(next.reason,"RECOVERY_REQUIRED");
  assert.deepEqual(next.actions,["verify","repair","rollback"]);
});

test("pre-Reality owner cancel follows Centre then optional Optician then Heimdall/Bifrost",async()=>{
  const route=await import(routeUrl);
  const returned=route.routeInterruptionReturn({requested:"CANCEL"});
  assert.equal(returned.interruption.state,"CANCELLED_BY_OWNER");
  assert.deepEqual(
    route.routeInterruptionFromCentre({interruption:returned.interruption,needsOptician:true}),
    {destination:"optician",via:"centre",reason:"CANCELLED_BY_OWNER"}
  );
  assert.deepEqual(
    route.routeInterruptionFromCentre({interruption:returned.interruption,heimdall:{decision:"WAIT",reason:"OWNER_RETURN_REVIEW"}}),
    {destination:"heimdall",via:"centre",reason:"OWNER_RETURN_REVIEW",interruption:"CANCELLED_BY_OWNER"}
  );
  assert.deepEqual(
    route.routeInterruptionFromCentre({interruption:returned.interruption,heimdall:{decision:"PASS"}}),
    {destination:"bifrost",via:"heimdall",next:"big-chat",reason:"CANCELLED_BY_OWNER"}
  );
});

test("Centre return preserves interruption payload and exact Return Address identity",async()=>{
  const [route,centre]=await Promise.all([import(routeUrl),import(centreUrl)]);
  const passage=centre.createCentrePassage();
  let work=passage.enter({checkpointId:"CENTRE-I1",workId:"WORK-I1"});
  work=passage.review(work,{task:"Do work",requestedResult:"Verified reality",authority:"BIG"});
  work=passage.fit(work,{lensId:"L-I1",lensReference:"lens://i1",fittedView:"route"});
  work=passage.leave(work,{destination:"destination://factory"}).work;
  const access=centre.admitDestination(work,{destination:"destination://factory",capability:{id:"factory"}});
  const interruption=route.routeInterruptionReturn({requested:"BLOCKED"}).interruption;
  const packet=centre.createReturnPacket(access,{kind:"WORK_INTERRUPTION_RETURN",interruption});
  const returned=passage.return(work,packet);
  assert.equal(returned.workId,"WORK-I1");
  assert.equal(returned.checkpointId,"CENTRE-I1");
  assert.equal(returned.returnedPayload.interruption.state,"BLOCKED");
});
