const claims=[["artifactLoads","artifact-loads"],["coreFlow","core-flow-correct"],["blueprintOutcome","blueprint-outcome-correct"]];
export function evaluateProductQc({artifact=null,blueprint=null,evidence=[]}={}){
  const digest=artifact?.digest==null?null:String(artifact.digest);
  const acceptedStatus=artifact?.status==="BUILT"||artifact?.status==="SIGNATURE_VERIFIED";
  const context=Boolean(artifact?.id&&acceptedStatus&&digest&&blueprint?.ref&&artifact.blueprintRef===blueprint.ref);
  const candidates=context&&Array.isArray(evidence)?evidence.filter(e=>e?.scope==="artifact"&&e.value?.digest===digest):[];
  const used=claims.map(([,claim])=>candidates.find(e=>e.claim===claim)).filter(Boolean);
  const checks={};
  for(const [key,claim] of claims)checks[key]=context&&Boolean(used.find(e=>e.claim===claim));
  checks.evidence=context&&used.length===claims.length;
  return Object.freeze({status:Object.values(checks).every(Boolean)?"pass":"fail",artifactId:artifact?.id||null,artifactDigest:digest,checks:Object.freeze(checks),evidenceIds:Object.freeze(used.map(e=>String(e.id))),checkedAt:new Date().toISOString()});
}
