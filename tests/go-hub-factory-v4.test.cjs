const test=require("node:test"); const assert=require("node:assert/strict");
async function mod(){return import("../go-hub-factory-v4.js");}
const work={workId:"W1",command:"build",expectedResult:"artifact",status:"ON PROCESS",holder:"GO",pass:{state:"ACTIVE",allowedDestinations:["factory"]}};
const form={repository:"pureekangraw-ops/standard-",branch:"work/x",plan:"change x",expectedOutput:"file",outputType:"FILE",criticalChecklist:[{id:"ci",label:"CI passes"}]};
test("Factory requires Centre Work Pass",async()=>{const {enterFactoryV4}=await mod();assert.throws(()=>enterFactoryV4({work:{...work,pass:null},form}),/ACTIVE Work Pass/);});
test("Factory follows PLAN BUILD ASSEMBLY MERGE CHECK OUTPUT",async()=>{const m=await mod();let s=m.enterFactoryV4({work,form});s=m.recordFactoryReality(s,{repository:form.repository,branch:form.branch,headSha:"abc",lastUpdated:"now"});s=m.advanceFactory(s);assert.equal(s.stage,"BUILD");s=m.advanceFactory(s,{result:{built:true}});assert.equal(s.stage,"ASSEMBLY");s=m.advanceFactory(s,{result:{assembled:true}});assert.equal(s.stage,"MERGE");s=m.advanceFactory(s,{result:{pr:1}});assert.equal(s.stage,"CHECK");s=m.updateCriticalCheck(s,{id:"ci",status:"PASS",evidence:"run"});s=m.advanceFactory(s);assert.equal(s.stage,"OUTPUT");s=m.finishFactory(s,{file:"artifact.apk"});assert.equal(s.output.value,"artifact.apk");});
test("CHECK blocks on critical checklist only",async()=>{const m=await mod();let s=m.enterFactoryV4({work,form});s=m.recordFactoryReality(s,{repository:form.repository,branch:form.branch,headSha:"abc",lastUpdated:"now"});s=m.advanceFactory(s);s=m.advanceFactory(s);s=m.advanceFactory(s);s=m.advanceFactory(s);assert.throws(()=>m.advanceFactory(s),/Critical Checklist/);});
test("Plan change safe-stops back to PLAN",async()=>{const m=await mod();let s=m.enterFactoryV4({work,form});s=m.recordFactoryReality(s,{repository:form.repository,branch:form.branch,headSha:"abc",lastUpdated:"now"});s=m.advanceFactory(s);s=m.safeStopToPlan(s,{reason:"rethink"});assert.equal(s.stage,"PLAN");});


test("durable Factory V4 service persists one project for the same Work",async()=>{
  const { GoHubFactoryState }=await import("../go-hub-factory-state.mjs");
  const { createFactoryV4Service }=await import("../go-hub-factory-service.mjs");
  const stores=new Map();
  const binding={
    getByName(name){
      if(!stores.has(name)){
        const values=new Map();
        const storage={
          async get(key){return structuredClone(values.get(key));},
          async put(entries){for(const [key,value] of Object.entries(entries))values.set(key,structuredClone(value));},
        };
        stores.set(name,new GoHubFactoryState({storage},{}));
      }
      return stores.get(name);
    },
  };
  const service=createFactoryV4Service({binding});
  const liveWork={...work,workId:"W-DURABLE",checkpointId:"CP-W-DURABLE"};
  let response=await service({action:"start",workId:liveWork.workId,work:liveWork,form:{...form,projectId:"FACTORY-W-DURABLE"}});
  assert.equal(response.status,200);
  let body=await response.json();
  assert.equal(body.stage,"PLAN");
  assert.equal(body.projectId,"FACTORY-W-DURABLE");
  response=await service({action:"record_reality",workId:liveWork.workId,reality:{repository:form.repository,branch:form.branch,headSha:"abc",lastUpdated:new Date().toISOString()}});
  assert.equal(response.status,200);
  response=await service({action:"inspect",workId:liveWork.workId});
  body=await response.json();
  assert.equal(body.task.reality.headSha,"abc");
  assert.equal(body.workId,"W-DURABLE");
});
