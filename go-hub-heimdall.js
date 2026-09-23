const DECISIONS=new Set(["PASS","WAIT","REJECT"]);
const FAILURE_STATUSES=new Set(["FAIL","FAILED","REJECT","REJECTED","ERROR"]);
const WAIT_STATUSES=new Set(["WAIT","WAITING","PENDING","UNKNOWN",""]);
function text(v){return String(v||"").trim();}
function freeze(v){if(v&&typeof v==="object"&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export function decideEvidenceGate(input={}){
 const workId=text(input.workId),checkpointId=text(input.checkpointId);
 if(!workId||!checkpointId)return freeze({decision:"WAIT",reason:"WORK_IDENTITY_REQUIRED",authority:"heimdall"});
 const checks=Array.isArray(input.checks)?input.checks:[];
 if(!checks.length)return freeze({decision:"WAIT",reason:"EVIDENCE_CHECKS_REQUIRED",authority:"heimdall",workId,checkpointId});
 const normalized=checks.map(x=>({id:text(x?.id)||"unknown",status:String(x?.status||"").toUpperCase(),evidenceRef:text(x?.evidenceRef)}));
 const failed=normalized.filter(x=>FAILURE_STATUSES.has(x.status));
 if(failed.length)return freeze({decision:"REJECT",reason:"EVIDENCE_CHECK_FAILED",authority:"heimdall",workId,checkpointId,failedChecks:failed.map(x=>x.id)});
 const waiting=normalized.filter(x=>x.status!=="PASS");
 if(waiting.length)return freeze({decision:"WAIT",reason:"EVIDENCE_CHECK_PENDING",authority:"heimdall",workId,checkpointId,pendingChecks:waiting.map(x=>x.id)});
 return freeze({decision:"PASS",reason:"EVIDENCE_ACCEPTED",authority:"heimdall",workId,checkpointId,evidenceRefs:normalized.map(x=>x.evidenceRef).filter(Boolean)});
}
export function auditSentinelEvent(decision={},input={}){
 const d=String(decision?.decision||"").toUpperCase();if(!DECISIONS.has(d))throw new Error("HEIMDALL_DECISION_REQUIRED");
 const eventId=text(input.eventId),workId=text(decision.workId),checkpointId=text(decision.checkpointId);
 if(!eventId)throw new Error("HEIMDALL_AUDIT_EVENT_ID_REQUIRED");
 if(!workId||!checkpointId)throw new Error("HEIMDALL_AUDIT_WORK_IDENTITY_REQUIRED");
 return freeze({eventId,type:"HEIMDALL_GATE_DECISION",workId,checkpointId,phase:"BOUNDARY",direction:text(input.direction)||null,targetId:text(input.targetId)||null,details:{decision:d,reason:text(decision.reason),evidenceRefs:Array.isArray(decision.evidenceRefs)?decision.evidenceRefs:[]}});
}
