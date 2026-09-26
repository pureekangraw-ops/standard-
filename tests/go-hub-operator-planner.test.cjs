"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const path=require("node:path");
const {pathToFileURL}=require("node:url");
const plannerUrl=pathToFileURL(path.resolve(__dirname,"..","go-hub-operator-planner.js")).href;

test("GO Operator plans a complex multi-surface command without executing or widening authority",async()=>{
  const {createOperatorCommandPlan}=await import(plannerUrl+"?multi="+Date.now());
  const plan=createOperatorCommandPlan({
    command:"ไปตรวจ Lighthouse ว่างาน background autosync ติดตรงไหน ถ้าเป็นโค้ดแก้ได้ให้ทำ ถ้าต้องใช้มือถือบิ๊กให้หยุด",
    requestedResult:"หาต้นเหตุและแก้เท่าที่ authority ปัจจุบันอนุญาต",
    allowedDestinations:["destination://lighthouse","destination://factory"],
    passState:"ACTIVE",
    workStatus:"ON PROCESS",
  });
  assert.equal(plan.mode,"HUB");
  assert.equal(plan.intent,"READ_THEN_ACT");
  assert.deepEqual(plan.steps.map(step=>step.surface),["lighthouse","factory"]);
  assert.equal(plan.steps.every(step=>step.permission==="ALLOWED_BY_CURRENT_PASS"),true);
  assert.equal(plan.executionPolicy.execute,false);
  assert.equal(plan.executionPolicy.canWidenAuthority,false);
  assert.equal(plan.stopConditions.includes("PHYSICAL_ACTION_REQUIRED"),true);
});

test("GO Operator exposes blocked routes from current Centre Pass instead of pretending authority",async()=>{
  const {createOperatorCommandPlan}=await import(plannerUrl+"?blocked="+Date.now());
  const plan=createOperatorCommandPlan({
    command:"ตรวจ Gmail แล้วเอาไฟล์ใน Drive ไปเตรียมตอบกลับ",
    allowedDestinations:["destination://drive"],
    passState:"ACTIVE",
    workStatus:"ON PROCESS",
  });
  assert.equal(plan.status,"PLAN_WITH_BLOCKED_ROUTES");
  assert.equal(plan.steps.find(step=>step.surface==="drive").permission,"ALLOWED_BY_CURRENT_PASS");
  assert.equal(plan.steps.find(step=>step.surface==="gmail").permission,"BLOCKED_BY_CURRENT_PASS");
});

test("hub-wide command with no named room starts at Maintenance inspection rather than spraying routes",async()=>{
  const {createOperatorCommandPlan}=await import(plannerUrl+"?hub="+Date.now());
  const plan=createOperatorCommandPlan({
    command:"ตรวจทั้งฮับว่ามีอะไรผิดปกติ",
    allowedDestinations:["destination://maintenance"],
    passState:"ACTIVE",
    workStatus:"ON PROCESS",
  });
  assert.equal(plan.mode,"HUB");
  assert.deepEqual(plan.steps.map(step=>step.surface),["maintenance"]);
});

test("ambiguous command stays UNKNOWN instead of inventing a target",async()=>{
  const {createOperatorCommandPlan}=await import(plannerUrl+"?unknown="+Date.now());
  const plan=createOperatorCommandPlan({command:"จัดการอันนี้ให้หน่อย"});
  assert.equal(plan.status,"NEEDS_TARGET");
  assert.deepEqual(plan.unknowns,["TARGET_UNRESOLVED"]);
});
