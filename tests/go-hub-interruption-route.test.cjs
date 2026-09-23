"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const path=require("node:path");
const {pathToFileURL}=require("node:url");

const root=path.resolve(__dirname,"..");
const routeUrl=pathToFileURL(path.join(root,"go-hub-city-route.js")).href;
const centreUrl=pathToFileURL(path.join(root,"go-hub-centre.js")).href;
const identity=Object.freeze({
  workId:"WORK-I1",
  checkpointId:"CENTRE-I1",
  returnAddress:"CENTRE-I1",
});

function expectIdentity(value, expected=identity){
  assert.equal(value.workId,expected.workId);
  assert.equal(value.checkpointId,expected.checkpointId);
  assert.equal(value.returnAddress,expected.returnAddress);
}

test("post-Reality cancel returns to Centre as recovery and keeps exact work identity",async()=>{
  const route=await import(routeUrl);
  const returned=route.routeInterruptionReturn({...identity,requested:"CANCEL",merged:true});
  assert.equal(returned.destination,"centre");
  assert.equal(returned.interruption.state,"RECOVERY_REQUIRED");
  assert.equal(returned.interruption.cancellable,false);
  expectIdentity(returned);

  const next=route.routeInterruptionFromCentre({
    ...identity,
    interruption:returned.interruption,
    heimdall:{decision:"PASS"},
  });
  assert.equal(next.destination,"go-work-loop");
  assert.equal(next.reason,"RECOVERY_REQUIRED");
  assert.deepEqual(next.actions,["verify","repair","rollback"]);
  expectIdentity(next);
});

test("pre-Reality owner cancel follows Centre then optional Optician then Heimdall/Bifrost without changing identity",async()=>{
  const route=await import(routeUrl);
  const returned=route.routeInterruptionReturn({...identity,requested:"CANCEL"});
  assert.equal(returned.interruption.state,"CANCELLED_BY_OWNER");
  expectIdentity(returned);

  const optician=route.routeInterruptionFromCentre({
    ...identity,
    interruption:returned.interruption,
    needsOptician:true,
  });
  assert.equal(optician.destination,"optician");
  assert.equal(optician.via,"centre");
  assert.equal(optician.reason,"CANCELLED_BY_OWNER");
  expectIdentity(optician);

  const heimdall=route.routeInterruptionFromCentre({
    ...identity,
    interruption:returned.interruption,
    heimdall:{decision:"WAIT",reason:"OWNER_RETURN_REVIEW"},
  });
  assert.equal(heimdall.destination,"heimdall");
  assert.equal(heimdall.via,"centre");
  assert.equal(heimdall.reason,"OWNER_RETURN_REVIEW");
  assert.equal(heimdall.interruption,"CANCELLED_BY_OWNER");
  expectIdentity(heimdall);

  const bifrost=route.routeInterruptionFromCentre({
    ...identity,
    interruption:returned.interruption,
    heimdall:{decision:"PASS"},
  });
  assert.equal(bifrost.destination,"bifrost");
  assert.equal(bifrost.via,"heimdall");
  assert.equal(bifrost.next,"big-chat");
  assert.equal(bifrost.reason,"CANCELLED_BY_OWNER");
  expectIdentity(bifrost);
});

test("City interruption return reuses the original Centre Work ID and Checkpoint through return and resume",async()=>{
  const [route,centre]=await Promise.all([import(routeUrl),import(centreUrl)]);
  const passage=centre.createCentrePassage();
  let work=passage.enter({checkpointId:identity.checkpointId,workId:identity.workId});
  work=passage.review(work,{task:"Do work",requestedResult:"Verified reality",authority:"BIG"});
  work=passage.fit(work,{personaId:"L-I1",personaReference:"persona://i1",workingView:"route"});
  work=passage.leave(work,{destination:"destination://factory"}).work;

  const access=centre.admitDestination(work,{
    destination:"destination://factory",
    capability:{id:"factory"},
  });
  assert.equal(access.returnAddress,identity.returnAddress);

  const routed=route.routeInterruptionReturn({...access,requested:"BLOCKED"});
  assert.equal(routed.destination,"centre");
  assert.equal(routed.interruption.state,"BLOCKED");
  expectIdentity(routed);

  const packet=centre.createReturnPacket(access,{
    kind:"WORK_INTERRUPTION_RETURN",
    interruption:routed.interruption,
  });
  assert.equal(packet.workId,identity.workId);
  assert.equal(packet.checkpointId,identity.returnAddress);

  const returned=passage.return(work,packet);
  assert.equal(returned.status,"RETURNED");
  assert.equal(returned.workId,identity.workId);
  assert.equal(returned.checkpointId,identity.checkpointId);
  assert.equal(returned.returnedPayload.interruption.state,"BLOCKED");

  const resumed=passage.resume(returned,{reuseFit:true});
  assert.equal(resumed.status,"READY");
  assert.equal(resumed.workId,identity.workId);
  assert.equal(resumed.checkpointId,identity.checkpointId);

  const next=route.routeInterruptionFromCentre({
    ...identity,
    interruption:returned.returnedPayload.interruption,
  });
  assert.equal(next.destination,"centre");
  assert.equal(next.reason,"BLOCKED");
  expectIdentity(next);
});

test("interruption routing fails closed when Return Address is not the original Checkpoint",async()=>{
  const route=await import(routeUrl);
  assert.throws(
    ()=>route.routeInterruptionReturn({
      workId:"WORK-I1",
      checkpointId:"CENTRE-I1",
      returnAddress:"CENTRE-OTHER",
      requested:"BLOCKED",
    }),
    /Return Address does not match Checkpoint ID/
  );

  const interruption=route.routeInterruptionReturn({...identity,requested:"BLOCKED"}).interruption;
  assert.throws(
    ()=>route.routeInterruptionFromCentre({
      workId:"WORK-I1",
      checkpointId:"CENTRE-I1",
      returnAddress:"CENTRE-OTHER",
      interruption,
    }),
    /Return Address does not match Checkpoint ID/
  );
});
