const RULES=Object.freeze([
 ["centre",["identity","state","ownership","effects","checkpoint","reality","validation","audit"],"CENTRE_HEALTH"],
 ["counter",["identity","state","workContext","returnRoute","readback"],"COUNTER_HEALTH"],
 ["factory",["assembly","merge","waitingRoom","readyGate","verification"],"FACTORY_HEALTH"],
 ["audit",["sequence","idempotency","pending"],"AUDIT_HEALTH"],
 ["persistence",["durableReadback","revision"],"PERSISTENCE_HEALTH"],
 ["verification",["chain","exactHead","evidence"],"VERIFICATION_HEALTH"],
 ["update",["current","serving","previous","rollback"],"UPDATE_HEALTH"],
 ["recovery",["checkpoint","resume","reconciliation"],"RECOVERY_HEALTH"],
 ["security",["secretRejection","authority","lease"],"SECURITY_HEALTH"],
]);
function clone(v){return v==null?v:structuredClone(v)}
export function maintenanceBaseline(){return RULES.map(([system,required,category])=>Object.freeze({system,required:Object.freeze([...required]),category}))}
export function scanHubHealth(snapshot={}){
 const findings=[]; const systems=[];
 for(const [system,required,category] of RULES){
  const truth=snapshot[system]; const missing=[];
  if(!truth||typeof truth!=="object") missing.push(...required);
  else for(const key of required) if(truth[key]==null||truth[key]===false) missing.push(key);
  systems.push(Object.freeze({system,status:missing.length?"FINDING":"PASS",missing:Object.freeze(missing)}));
  if(missing.length) findings.push(Object.freeze({category,system,severity:"REVIEW",reason:"MISSING_OR_UNHEALTHY_TRUTH",missing:Object.freeze(missing),route:"factory",mutates:false}));
 }
 return Object.freeze({status:findings.length?"FINDINGS":"HEALTHY",authority:"INSPECT_AND_ROUTE_ONLY",mutates:false,systems:Object.freeze(systems),findings:Object.freeze(findings),snapshot:clone(snapshot)});
}
