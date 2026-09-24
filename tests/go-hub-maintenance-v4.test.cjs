const test=require("node:test");const assert=require("node:assert/strict");async function mod(){return import("../go-hub-maintenance.js?flash="+Date.now());}
const work={workId:"WM",status:"ON PROCESS",holder:"GO",pass:{kind:"MAINTENANCE",state:"ACTIVE",allowedDestinations:["ALL_GO_HUB_OWNED_AREAS"]}};
const fullMap={
  cartridgeId:"FULL-V4-001",profile:"FULL_SYSTEM",version:"V4",hash:"full-hash-001",source:"GO_FIRST_REALITY_RUN",
  manifest:{expectedRoutes:1,expectedCheckpoints:2},
  routes:[{id:"centre-factory",from:"centre",to:"factory",checkpoints:[
    {id:"centre-pass",importantValue:"Factory path allowed",expected:true,source:"go-hub-centre-v4.js",probeAction:"read",mode:"READ",ownerSource:"GO Hub"},
    {id:"factory-flow",importantValue:"Factory stages",expected:{contains:["PLAN","BUILD","ASSEMBLY","MERGE","CHECK","OUTPUT"]},source:"go-hub-factory-v4.js",probeAction:"read",mode:"READ",ownerSource:"GO Hub"}
  ]}]
};
const smokeMap={
  cartridgeId:"SMOKE-V4-001",profile:"SMOKE",version:"V4",hash:"smoke-hash-001",source:"SMOKE_TEST",
  manifest:{expectedRoutes:1,expectedCheckpoints:1},
  routes:[{id:"runtime-owner-bindings",from:"runtime",to:"bindings",checkpoints:[
    {id:"centre-binding",importantValue:"Centre binding",expected:true,source:"binding:GO_HUB_CENTRE_STATE",probeAction:"read",mode:"READ",ownerSource:"GO Hub"}
  ]}]
};
async function mount(service,map=fullMap){const r=await service.run({work,action:"mount_map",map});assert.equal(r.status,200);return r.json();}

test("Maintenance is Work/Pass bound",async()=>{const {createMaintenanceV4}=await mod();const s=createMaintenanceV4();assert.equal((await s.run({action:"inspect"})).status,409);assert.equal((await s.run({work:{...work,pass:null},action:"inspect"})).status,409);assert.equal((await s.run({work,action:"inspect"})).status,200);});

test("Runner refuses implicit map and requires a mounted cartridge",async()=>{
  const {createMaintenanceV4}=await mod();const s=createMaintenanceV4();
  let r=await s.run({work,action:"run_system_check",map:fullMap});let b=await r.json();
  assert.equal(r.status,409);assert.equal(b.code,"IMPLICIT_MAINTENANCE_MOUNT_FORBIDDEN");
  r=await s.run({work,action:"run_system_check"});b=await r.json();
  assert.equal(r.status,409);assert.equal(b.code,"MAINTENANCE_CARTRIDGE_NOT_MOUNTED");
});

test("Mounted FULL_SYSTEM cartridge drives the check and can verify only its manifest coverage",async()=>{
  const {createMaintenanceV4}=await mod();
  const s=createMaintenanceV4({readValue:async p=>({available:true,value:p.id==="centre-pass"?true:["PLAN","BUILD","ASSEMBLY","MERGE","CHECK","OUTPUT"],evidenceRef:"test://"+p.id}),traceId:()=>"T1",now:()=>"NOW"});
  const m=await mount(s);assert.equal(m.mountedCartridge.cartridgeId,"FULL-V4-001");
  const r=await s.run({work,action:"run_system_check"});const b=await r.json();
  assert.equal(b.status,"MAINTENANCE_CHECK_COMPLETE");assert.equal(b.routes[0].status,"PASS");
  assert.equal(b.traceId,"T1");assert.equal(b.next,"FULL_SYSTEM_CHECK_VERIFIED");
  assert.equal(b.report.reportVersion,3);assert.equal(b.report.cartridge.profile,"FULL_SYSTEM");
  assert.equal(b.report.coverage.checkpoints.total,2);
});

test("Smoke cartridge cannot masquerade as full-system verification and does not mutate another cartridge implicitly",async()=>{
  const {createMaintenanceV4}=await mod();
  const s=createMaintenanceV4({readValue:async()=>({available:true,value:true}),traceId:()=>"T-SMOKE",now:()=>"NOW"});
  await mount(s,fullMap);
  const inspected=await (await s.run({work,action:"inspect_map",map:smokeMap})).json();
  assert.equal(inspected.persisted,false);assert.equal(inspected.mountedCartridge.cartridgeId,"FULL-V4-001");
  let current=await (await s.run({work,action:"inspect"})).json();
  assert.equal(current.mountedCartridge.cartridgeId,"FULL-V4-001");
  await mount(s,smokeMap);
  const checked=await (await s.run({work,action:"run_system_check"})).json();
  assert.equal(checked.status,"MAINTENANCE_CHECK_COMPLETE");
  assert.equal(checked.next,"SMOKE_CHECK_VERIFIED");
  assert.notEqual(checked.next,"FULL_SYSTEM_CHECK_VERIFIED");
});

test("Mount validates cartridge identity and manifest counts",async()=>{
  const {createMaintenanceV4}=await mod();const s=createMaintenanceV4();
  let r=await s.run({work,action:"mount_map",map:{...fullMap,hash:""}});let b=await r.json();
  assert.equal(r.status,409);assert.equal(b.code,"MAINTENANCE_CARTRIDGE_IDENTITY_REQUIRED");
  r=await s.run({work,action:"mount_map",map:{...fullMap,manifest:{expectedRoutes:23,expectedCheckpoints:241}}});b=await r.json();
  assert.equal(r.status,409);assert.equal(b.code,"MAINTENANCE_CARTRIDGE_MANIFEST_MISMATCH");
});

test("Eject removes the current cartridge and runner cannot fall back to stale legacy state",async()=>{
  const {createMaintenanceV4}=await mod();const s=createMaintenanceV4();
  await mount(s);
  const e=await (await s.run({work,action:"eject_map"})).json();
  assert.equal(e.status,"MAINTENANCE_CARTRIDGE_EJECTED");assert.equal(e.mountedCartridge,null);
  const r=await s.run({work,action:"run_system_check"});const b=await r.json();
  assert.equal(r.status,409);assert.equal(b.code,"MAINTENANCE_CARTRIDGE_NOT_MOUNTED");
});

test("UNKNOWN is attention and can never produce FULL_SYSTEM_CHECK_VERIFIED",async()=>{
  const {createMaintenanceV4}=await mod();
  const s=createMaintenanceV4({readValue:async p=>p.id==="centre-pass"?{available:true,value:true}:{available:false,reason:"TEST_UNAVAILABLE"}});
  await mount(s);
  const b=await (await s.run({work,action:"run_system_check"})).json();
  assert.equal(b.status,"MAINTENANCE_CHECK_ATTENTION");
  assert.equal(b.report.coverage.UNKNOWN??b.report.coverage.unknown,1);
  assert.notEqual(b.next,"FULL_SYSTEM_CHECK_VERIFIED");
});

test("First bad value stops downstream and no auto repair",async()=>{
  const {createMaintenanceV4}=await mod();let reads=0;
  const s=createMaintenanceV4({readValue:async p=>{reads++;return{available:true,value:p.id==="centre-pass"?false:[]};}});
  await mount(s);const b=await (await s.run({work,action:"run_system_check"})).json();
  assert.equal(b.routes[0].checkpoints[0].status,"FAIL");assert.equal(b.routes[0].checkpoints[1].status,"NOT_CHECKED");
  assert.equal(reads,1);assert.equal(b.autoRepair,false);
});

test("Mutating probes are blocked",async()=>{
  const {createMaintenanceV4}=await mod();let reads=0;
  const bad={cartridgeId:"BAD-001",profile:"CUSTOM",version:"V4",hash:"bad-hash",manifest:{expectedRoutes:1,expectedCheckpoints:1},routes:[{id:"gmail",from:"centre",to:"gmail",checkpoints:[{id:"send",importantValue:"send",expected:true,source:"gmail",probeAction:"send",mode:"MUTATE"}]}]};
  const s=createMaintenanceV4({readValue:async()=>{reads++;return{available:true,value:true};}});
  await mount(s,bad);const b=await (await s.run({work,action:"run_system_check"})).json();
  assert.equal(b.routes[0].status,"BLOCKED");assert.equal(reads,0);
});

test("Maintenance report exposes reached-until, safe evidence, relation mismatch and bounded persona-aware views",async()=>{
  const {createMaintenanceV4}=await mod();
  const s=createMaintenanceV4({
    readValue:async p=>p.id==="centre-pass"
      ? {available:true,value:true,evidenceRef:"owner://centre",safeEvidence:{kind:"CENTRE"}}
      : {available:true,value:["PLAN","BUILD"],evidenceRef:"owner://factory",safeEvidence:{kind:"FACTORY"}},
    traceId:()=>"T-REPORT",now:()=>"NOW",
  });
  await mount(s);
  const body=await (await s.run({work,action:"run_system_check"})).json();
  assert.equal(body.status,"MAINTENANCE_CHECK_ATTENTION");
  assert.equal(body.routes[0].firstBreak,"factory-flow");
  assert.equal(body.routes[0].reachedUntil,"factory-flow");
  assert.equal(body.routes[0].firstBadValue.relationMismatch.type,"RELATION_MISMATCH");
  assert.equal(body.routes[0].checkpoints[0].safeEvidence.kind,"CENTRE");
  assert.equal(body.report.reportVersion,3);
  assert.equal(body.report.firstBreaks[0].firstBreak,"factory-flow");
  assert.equal(body.report.decisionPoints[0].checkpointId,"factory-flow");
  assert.equal(body.views.cartographer.brokenRoutes[0].routeId,"centre-factory");
  assert.equal(body.views.detective.causalLeads[0].verdict,"EVIDENCE_BOUND_FIRST_CAUSAL_BREAK");
  assert.equal(body.views.detective.hardLock,"READ_ONLY_ZERO_MUTATION");
  assert.deepEqual(body.views.ghostbusters.confirmedGhosts,[]);
  assert.equal(body.report.safety.autoRepair,false);
});
