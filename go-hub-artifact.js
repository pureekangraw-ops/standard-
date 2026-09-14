function required(value,label){const text=String(value||"").trim();if(!text)throw new Error(`${label} is required`);return text;}
export function createBuildArtifact({id,kind,assembly,assemblyQc,digest,location,builtAt}={}){
  if(assemblyQc?.status!=="pass"||assemblyQc.checkedHeadSha!==assembly?.integrationHeadSha)throw new Error("current Assembly QC pass is required");
  return Object.freeze({id:required(id,"artifact id"),kind:required(kind,"artifact kind"),assemblyId:required(assembly?.id,"assembly id"),sourceHeadSha:required(assembly.integrationHeadSha,"source head"),blueprintRef:required(assembly.blueprintRef,"blueprint ref"),digest:required(digest,"digest"),location:required(location,"location"),builtAt:required(builtAt,"builtAt"),status:"BUILT"});
}
export function inspectArtifact({artifact,evidence=[]}={}){
  const digest=String(artifact?.digest||""); const claims=["artifact-loads","source-binding-correct"];
  const used=claims.map(claim=>evidence.find(e=>e?.scope==="artifact"&&e.claim===claim&&e.value?.digest===digest)).filter(Boolean);
  return Object.freeze({status:digest&&used.length===claims.length?"pass":"fail",artifactId:artifact?.id||null,artifactDigest:digest||null,evidenceIds:Object.freeze(used.map(e=>String(e.id))),checkedAt:new Date().toISOString()});
}
