const DECISIONS=new Set(["PASS","WAIT","REJECT"]);
function text(v){return String(v||"").trim();}
function freeze(v){if(v&&typeof v==="object"&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export function decideEvidenceGate(input={}){
 const workId=text(input.workId),checkpointId=text(input.checkpointId);
 if(!workId||!checkpointId)return freeze({decision:"WAIT",reason:"WORK_IDENTITY_REQUIRED",authority:"heimdall"});
 const checks=Array.isArray(input.checks)?input.checks:[];
 if(!checks.length)return freeze({decision:"WAIT",reason:"EVIDENCE_CHECKS_REQUIRED",authority:"heimdall",workId,checkpointId});
 const failed=checks.filter(x=>String(x?.status||"").toUpperCase()!=="PASS");
 if(failed.length)return freeze({decision:"REJECT",reason:"EVIDENCE_CHECK_FAILED",authority:"heimdall",workId,checkpointId,failedChecks:failed.map(x=>text(x?.id)||"unknown")});
 return freeze({decision:"PASS",reason:"EVIDENCE_ACCEPTED",authority:"heimdall",workId,checkpointId,evidenceRefs:checks.map(x=>text(x?.evidenceRef)).filter(Boolean)});
}
export function auditSentinelEvent(decision={},input={}){
 const d=String(decision?.decision||"").toUpperCase();if(!DECISIONS.has(d))throw new Error("HEIMDALL_DECISION_REQUIRED");
 return freeze({eventId:text(input.eventId),type:"HEIMDALL_GATE_DECISION",workId:text(decision.workId),checkpointId:text(decision.checkpointId),phase:"BOUNDARY",targetId:text(input.targetId)||null,details:{decision:d,reason:text(decision.reason),evidenceRefs:Array.isArray(decision.evidenceRefs)?decision.evidenceRefs:[]}});
}
