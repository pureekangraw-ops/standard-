const STAGES = Object.freeze(["PLAN","BUILD","ASSEMBLY","MERGE","CHECK","OUTPUT"]);
const OUTPUT_TYPES = new Set(["FILE","REF"]);

function text(v){ return String(v ?? "").trim(); }
function required(v,label){ const s=text(v); if(!s) throw new Error(`${label} is required`); return s; }
function freeze(v){ if(v&&typeof v==="object"&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);} return v; }
function snap(v){ return freeze(structuredClone(v)); }
function requireFactoryPass(work={}){
  if(text(work.status)!=="ON PROCESS") throw new Error("Factory requires ON PROCESS Work");
  if(!text(work.holder)) throw new Error("Factory requires Work holder");
  if(work.pass?.state!=="ACTIVE") throw new Error("Factory requires ACTIVE Work Pass");
  const allowed=Array.isArray(work.pass?.allowedDestinations)?work.pass.allowedDestinations:[];
  if(!allowed.includes("factory")&&!allowed.includes("destination://factory")&&!allowed.includes("ALL_GO_HUB_OWNED_AREAS")) throw new Error("Factory destination is not open");
  return true;
}
function normalizeChecklist(items=[]){return (Array.isArray(items)?items:[]).map(x=>({id:required(x.id,"Checklist ID"),label:required(x.label,"Checklist label"),status:text(x.status).toUpperCase()||"PENDING",evidence:x.evidence??null}));}

export function enterFactoryV4({work,form={}}={}){
  requireFactoryPass(work);
  const outputType=text(form.outputType).toUpperCase();
  if(!OUTPUT_TYPES.has(outputType)) throw new Error("Output Type must be FILE or REF");
  return snap({
    workId:work.workId, holder:work.holder, stage:"PLAN",
    form:{
      goal:required(form.goal||work.command,"Goal/Command"),
      repository:required(form.repository,"Repository"),
      branch:required(form.branch,"Branch"),
      inputReferences:Array.isArray(form.inputReferences)?form.inputReferences:[],
      plan:form.plan??null,
      expectedOutput:required(form.expectedOutput||work.expectedResult,"Expected Output"),
      criticalChecklist:normalizeChecklist(form.criticalChecklist),
      outputType,
    },
    reality:null, build:null, assembly:null, merge:null, check:null, output:null,
    diagnosticEvidence:[],
  });
}
export function recordFactoryReality(state,reality={}){
  if(state.stage!=="PLAN") throw new Error("Reality inspection belongs to PLAN");
  const next=structuredClone(state);
  next.reality={repository:required(reality.repository,"Reality repository"),branch:required(reality.branch,"Reality branch"),headSha:required(reality.headSha,"Reality HEAD SHA"),changedFiles:Array.isArray(reality.changedFiles)?reality.changedFiles:[],commits:Array.isArray(reality.commits)?reality.commits:[],pullRequest:reality.pullRequest??null,checks:reality.checks??null,build:reality.build??null,artifact:reality.artifact??null,deployment:reality.deployment??null,release:reality.release??null,lastUpdated:required(reality.lastUpdated,"Reality Last Updated")};
  return snap(next);
}
export function setFactoryPlan(state,{plan}={}){
  if(state.stage!=="PLAN") throw new Error("Plan can only change in PLAN");
  const next=structuredClone(state); next.form.plan=required(plan,"Plan"); return snap(next);
}
export function advanceFactory(state,{result=null,evidence=null}={}){
  const index=STAGES.indexOf(state.stage); if(index<0) throw new Error("Factory stage is invalid");
  if(state.stage==="PLAN" && (!state.reality||!text(state.form.plan))) throw new Error("PLAN requires Reality and Plan before BUILD");
  if(state.stage==="CHECK"){
    const failed=state.form.criticalChecklist.filter(x=>x.status!=="PASS");
    if(failed.length) throw new Error("Critical Checklist is not PASS");
  }
  if(state.stage==="OUTPUT") throw new Error("Factory is already at OUTPUT");
  const next=structuredClone(state);
  if(state.stage==="BUILD") next.build=result;
  if(state.stage==="ASSEMBLY") next.assembly=result;
  if(state.stage==="MERGE") next.merge=result;
  if(evidence) next.diagnosticEvidence.push(evidence);
  next.stage=STAGES[index+1]; return snap(next);
}
export function updateCriticalCheck(state,{id,status,evidence=null}={}){
  if(state.stage!=="CHECK") throw new Error("Critical Checklist updates belong to CHECK");
  const next=structuredClone(state), item=next.form.criticalChecklist.find(x=>x.id===text(id));
  if(!item) throw new Error("Critical Checklist item not found");
  item.status=text(status).toUpperCase(); item.evidence=evidence; next.check={updated:true}; return snap(next);
}
export function safeStopToPlan(state,{reason,reality=null}={}){
  const next=structuredClone(state); next.stage="PLAN"; next.diagnosticEvidence.push({type:"SAFE_STOP",reason:required(reason,"Safe stop reason"),reality}); return snap(next);
}
export function finishFactory(state,{file=null,ref=null,summary=null}={}){
  if(state.stage!=="OUTPUT") throw new Error("Factory is not at OUTPUT");
  const value=state.form.outputType==="FILE"?file:ref;
  if(!value) throw new Error(`${state.form.outputType} output is required`);
  const next=structuredClone(state); next.output={type:state.form.outputType,value,summary}; return snap(next);
}
export function factoryBoardView(state){
  return snap({workId:state.workId,holder:state.holder,stage:state.stage,reality:state.reality||{status:"UNKNOWN"},output:state.output});
}
export { STAGES };
