const test=require("node:test");
const assert=require("node:assert/strict");

test("Work Card keeps one Job Code while Status follows Work reality",async()=>{
  const c=await import("../go-hub-centre-v4.js");
  const card=await import("../go-hub-work-card.js");
  let work=c.createWorkRecord({
    workId:"WORK-CARD-SMOKE-20260926-001",
    createdAt:"2026-09-26T02:00:00.000Z",
    name:"Card smoke",
    command:"build card",
    expectedResult:"one durable card",
    requestedDestinations:["lighthouse","factory"],
    scope:["GO/Knowledge"],
    workType:"URGENT",
  });
  const first=card.workCardView(work);
  assert.match(first.jobCode,/^2609-[A-Z0-9]{4}$/);
  assert.equal(first.status,"Work");
  assert.deepEqual(first.destinations,["lighthouse","factory"]);
  assert.deepEqual(first.scope,["GO/Knowledge"]);
  assert.equal(first.type,"URGENT");
  assert.equal(card.cardCompleteness(first).complete,true);

  work=c.claimWork(work,{actor:"GO",at:"2026-09-26T02:01:00.000Z"});
  const resumed=card.workCardView(work);
  assert.equal(resumed.status,"Resume");
  assert.equal(resumed.jobCode,first.jobCode);

  work=c.returnWork(work,{actor:"GO",status:"COMPLETE",result:{ok:true},evidence:[{ref:"test://card"}],at:"2026-09-26T02:02:00.000Z"});
  const done=card.workCardView(work);
  assert.equal(done.status,"Done");
  assert.equal(done.jobCode,first.jobCode);
});

test("Heimdall resolves Job Code, filters Destination and Scope, and owns CAUTION only",async()=>{
  const c=await import("../go-hub-centre-v4.js");
  const h=await import("../go-hub-heimdall-v4.js");
  const good=c.createWorkRecord({
    workId:"WORK-SEARCH-20260926-001",
    createdAt:"2026-09-26T02:00:00.000Z",
    name:"Search card",
    command:"search",
    expectedResult:"found",
    requestedDestinations:["factory"],
    scope:["GO/Knowledge"],
  });
  const incomplete=c.createWorkRecord({
    workId:"WORK-SEARCH-20260926-002",
    createdAt:"2026-09-26T02:01:00.000Z",
    name:"Incomplete card",
    command:"inspect",
    expectedResult:"caution",
    requestedDestinations:["factory"],
  });
  const heimdall=h.createThinHeimdall({works:[good,incomplete]});
  const jobCode=good.jobCode;
  assert.equal(heimdall.resolve(jobCode).workId,good.workId);
  assert.equal(heimdall.profile(jobCode).card.jobCode,jobCode);
  const matches=heimdall.lookup({status:"Work",destination:"factory",scope:"GO/Knowledge"});
  assert.deepEqual(matches.map(item=>item.workId),[good.workId]);
  const scan=heimdall.scan();
  assert.equal(scan.health,"CAUTION");
  assert.equal(scan.cautions.some(item=>item.workId===incomplete.workId&&item.kind==="INCOMPLETE_CARD"),true);
  assert.equal(incomplete.status,"OPEN");
});

test("legacy Work gets stable human Job Code without replacing canonical Work ID",async()=>{
  const card=await import("../go-hub-work-card.js");
  const work={
    workId:"WORK-GO-HUB-LEAN-FLOW-REDESIGN-20260920",
    createdAt:"2026-09-20T04:42:32.576Z",
    status:"ARRIVED",
    requestedDestinations:["factory"],
    scope:["GO-Hub"],
    name:"Lean Flow",
  };
  const view=card.workCardView(work);
  assert.match(view.jobCode,/^2009-[A-Z0-9]{4}$/);
  assert.equal(view.workId,work.workId);
  assert.equal(view.status,"Work");
});
