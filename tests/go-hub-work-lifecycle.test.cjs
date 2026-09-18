"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const path=require("node:path");
const {pathToFileURL}=require("node:url");
const url=pathToFileURL(path.resolve(__dirname,"../go-hub-work-lifecycle.js")).href;

test("shared interruption vocabulary normalizes STOP to BLOCKED",async()=>{
  const m=await import(url);
  assert.equal(m.resolveWorkInterruption({requested:"STOP"}).state,"BLOCKED");
  assert.equal(Object.isFrozen(m.WORK_INTERRUPTION),true);
});

test("cancel after Reality exists becomes recovery and never pretends Reality disappeared",async()=>{
  const {resolveWorkInterruption}=await import(url);
  for(const input of[
    {requested:"CANCEL",realityExists:true},
    {requested:"WITHDRAW",merged:true},
    {requested:"ABANDON",deployed:true},
  ]){
    const result=resolveWorkInterruption(input);
    assert.equal(result.state,"RECOVERY_REQUIRED");
    assert.equal(result.cancellable,false);
    assert.deepEqual(result.actions,["verify","repair","rollback"]);
  }
});

test("pre-Reality owner cancel is terminal while verification failure is recovery",async()=>{
  const {resolveWorkInterruption}=await import(url);
  const cancelled=resolveWorkInterruption({requested:"CANCEL"});
  assert.equal(cancelled.state,"CANCELLED_BY_OWNER");
  assert.equal(cancelled.terminal,true);
  const failed=resolveWorkInterruption({requested:"VERIFY_FAILED",realityExists:true});
  assert.equal(failed.state,"RECOVERY_REQUIRED");
  assert.equal(failed.terminal,false);
});
