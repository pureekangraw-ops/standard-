const claims = [["structure","structure-correct"],["flow","flow-correct"],["combinedBehavior","combined-behavior-correct"]];
export function evaluateAssemblyQc({assembly=null,blueprint=null,evidence=[]}={}) {
  const head=assembly?.integrationHeadSha==null?null:String(assembly.integrationHeadSha);
  const context=Boolean(assembly?.id&&assembly.status==="ASSEMBLED"&&head&&blueprint?.ref&&assembly.blueprintRef===blueprint.ref);
  const candidates=context&&Array.isArray(evidence)?evidence.filter(e=>e?.scope==="assembly"&&e.headSha===head):[];
  const used=claims.map(([,claim])=>candidates.find(e=>e.claim===claim)).filter(Boolean);
  const checks={}; for(const [key,claim] of claims) checks[key]=context&&Boolean(used.find(e=>e.claim===claim));
  checks.evidence=context&&used.length===claims.length;
  return Object.freeze({status:Object.values(checks).every(Boolean)?"pass":"fail",checkedHeadSha:head,checks:Object.freeze(checks),evidenceIds:Object.freeze(used.map(e=>String(e.id))),checkedAt:new Date().toISOString()});
}
