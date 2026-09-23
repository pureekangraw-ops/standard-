"use strict";
const test=require("node:test"); const assert=require("node:assert/strict"); const path=require("node:path"); const {pathToFileURL}=require("node:url");
const url=pathToFileURL(path.resolve(__dirname,"../go-hub-factory-auto-runner.mjs")).href;

test("Factory auto runner keeps advancing actionable lifecycle states",async()=>{
  const {createFactoryAutoRunner}=await import(url);
  let revision=0; let task={state:"PR_OPEN",nextAction:"check-ci",factoryStage:null};
  const actions=[];
  const runner=createFactoryAutoRunner({
    loadTask:async()=>({task,revision}),
    executeAction:async({action})=>{actions.push(action);revision+=1;if(actions.length===1)task={state:"CI_RUNNING",nextAction:"check-ci",factoryStage:null};else task={state:"VERIFIED",nextAction:"complete",factoryStage:null};return{status:"OK",receipt:{id:"r"+revision}};},
  });
  const result=await runner.run({taskId:"W1"});
  assert.equal(result.status,"DONE"); assert.deepEqual(actions,["check_ci","check_ci"]); assert.equal(result.receipts.length,2);
});

test("Factory auto runner stops on owner-required state",async()=>{
  const {createFactoryAutoRunner}=await import(url);
  const runner=createFactoryAutoRunner({loadTask:async()=>({task:{state:"BLOCKED",nextAction:"resolve-blocker",factoryStage:null},revision:3}),executeAction:async()=>{throw new Error("must not execute");}});
  const result=await runner.run({taskId:"W2"});
  assert.equal(result.status,"WAIT"); assert.equal(result.decision.nextAction,"resolve-blocker");
});

test("Factory auto runner enforces lock and retry budget",async()=>{
  const {createFactoryAutoRunner}=await import(url);
  const busy=createFactoryAutoRunner({loadTask:async()=>({}),executeAction:async()=>({}),acquireLock:async()=>({acquired:false})});
  assert.equal((await busy.run({taskId:"W3"})).status,"BUSY");
  const runner=createFactoryAutoRunner({loadTask:async()=>({task:{state:"PR_OPEN",nextAction:"check-ci",factoryStage:null},revision:1}),executeAction:async()=>({status:"ACTION_FAILED"}),retryBudget:1});
  const result=await runner.run({taskId:"W4"});
  assert.equal(result.reason,"RETRY_BUDGET_EXHAUSTED");
});


test("Factory execution adapter maps authority actions without changing authority",async()=>{
  const {resolveFactoryExecutionAction}=await import(url+"?adapter="+Date.now());
  assert.equal(resolveFactoryExecutionAction("inspect-reality"),"inspect");
  assert.equal(resolveFactoryExecutionAction("check-ci"),"check_ci");
  assert.equal(resolveFactoryExecutionAction("diagnose-failure"),"diagnose_failure");
  assert.equal(resolveFactoryExecutionAction("local-verify"),"local_verify");
});
