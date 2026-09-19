"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const workerUrl = pathToFileURL(path.resolve(__dirname, "../go-hub-factory-mcp-worker.mjs")).href;

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function context(overrides = {}) {
  return {
    workId: "WORK-A",
    checkpointId: "CP-A",
    returnAddress: "CP-A",
    destination: "destination://factory",
    task: "Mutate",
    requestedResult: "Verified",
    lensReference: "role://worker",
    ...overrides,
  };
}

test("governed mutation allows legacy unclaimed Work and writes intent plus result audit", async () => {
  const { createGovernedMutationRunner } = await import(workerUrl + "?legacy=" + Date.now());
  const events = [];
  const runner = createGovernedMutationRunner({
    centreLive: { action: async () => response({
      ok:true, checkpointId:"CP-A",
      ownership:{ enforced:false, active:false, revision:0 },
    })},
    globalAudit: { append: async event => {
      events.push(event);
      return response({ ok:true, sequence:events.length, event });
    }},
  });
  let executed = 0;
  const result = await runner("github.put_file", { workContext:context() }, async () => {
    executed += 1;
    return response({ ok:true, commit:"abc" });
  });
  assert.equal(result.status, 200);
  assert.equal(executed, 1);
  assert.deepEqual(events.map(event => event.type), ["TOOL_MUTATION_INTENT","TOOL_MUTATION_RESULT"]);
  assert.equal(events[0].workId, "WORK-A");
  assert.equal(events[1].details.ok, true);
});

test("claimed Work requires exact active Centre lease before side effect", async () => {
  const { createGovernedMutationRunner } = await import(workerUrl + "?lease=" + Date.now());
  let executed = 0;
  let auditCalls = 0;
  const runner = createGovernedMutationRunner({
    centreLive: { action: async () => response({
      ok:true, checkpointId:"CP-A",
      ownership:{ enforced:true, active:true, revision:4, ownerId:"GO-A", leaseId:"LEASE-A" },
    })},
    globalAudit: { append: async () => { auditCalls += 1; return response({ok:true,sequence:auditCalls}); }},
  });
  const missing = await runner("drive.move_item", { workContext:context() }, async () => {
    executed += 1; return response({ok:true});
  });
  assert.equal(missing.status, 409);
  assert.deepEqual(await missing.json(), { code:"CENTRE_WORK_LEASE_REQUIRED" });
  assert.equal(executed, 0);
  assert.equal(auditCalls, 0);

  const valid = await runner("drive.move_item", {
    workContext:context({ ownerId:"GO-A", leaseId:"LEASE-A", ownershipRevision:4 }),
  }, async () => {
    executed += 1; return response({ok:true,readback:"PASS"});
  });
  assert.equal(valid.status, 200);
  assert.equal(executed, 1);
  assert.equal(auditCalls, 2);
});

test("audit intent failure prevents mutation and result audit failure reports reconciliation", async () => {
  const { createGovernedMutationRunner } = await import(workerUrl + "?audit=" + Date.now());
  let executed = 0;
  const blocked = createGovernedMutationRunner({
    centreLive:{ action:async()=>response({ok:true,checkpointId:"CP-A",ownership:{enforced:false}}) },
    globalAudit:{ append:async()=>response({code:"AUDIT_DOWN"},503) },
  });
  const before = await blocked("github.put_file",{workContext:context()},async()=>{executed+=1;return response({ok:true});});
  assert.equal(before.status,502);
  assert.equal((await before.json()).code,"GLOBAL_AUDIT_INTENT_REQUIRED");
  assert.equal(executed,0);

  let auditCalls=0;
  const after = createGovernedMutationRunner({
    centreLive:{ action:async()=>response({ok:true,checkpointId:"CP-A",ownership:{enforced:false}}) },
    globalAudit:{ append:async()=>{
      auditCalls+=1;
      return auditCalls===1 ? response({ok:true,sequence:1}) : response({code:"AUDIT_DOWN"},503);
    }},
  });
  const reconciled=await after("github.put_file",{workContext:context()},async()=>{
    executed+=1;
    return response({ok:true,commit:"world-changed"});
  });
  const body=await reconciled.json();
  assert.equal(reconciled.status,502);
  assert.equal(body.code,"GLOBAL_AUDIT_RECONCILIATION_REQUIRED");
  assert.equal(body.mutationObserved,true);
  assert.equal(executed,1);
});
