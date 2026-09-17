function required(value,label){const text=String(value||"").trim();if(!text)throw new Error(`${label} is required`);return text;}
function assertMergeGate({assembly,mergeGate}={}){
  if(mergeGate?.status!=="MERGED_VERIFIED")throw new Error("verified Merge Gate is required");
  const assemblyHead=required(assembly?.integrationHeadSha,"assembly head");
  if(String(mergeGate.assemblyId||"")!==String(assembly?.id||"")||String(mergeGate.sourceHeadSha||"")!==assemblyHead)throw new Error("Merge Gate must match the accepted Assembly");
  const prHead=required(mergeGate.pullRequestHeadSha,"Merge Gate PR head");
  const ciHead=required(mergeGate.ciHeadSha,"Merge Gate CI head");
  const mergeSha=required(mergeGate.mergeSha,"Merge Gate merge SHA");
  const mainSha=required(mergeGate.mainSha,"Merge Gate main SHA");
  if(prHead!==assemblyHead||ciHead!==prHead||mergeSha!==mainSha)throw new Error("Merge Gate truth is stale or inconsistent");
  return {assemblyHead,mainSha};
}
export function createBuildArtifact({id,kind,assembly,assemblyQc,mergeGate,digest,location,builtAt}={}){
  if(assemblyQc?.status!=="pass"||assemblyQc.checkedHeadSha!==assembly?.integrationHeadSha)throw new Error("current Assembly QC pass is required");
  const binding=assertMergeGate({assembly,mergeGate});
  return Object.freeze({id:required(id,"artifact id"),kind:required(kind,"artifact kind"),assemblyId:required(assembly?.id,"assembly id"),assemblyHeadSha:binding.assemblyHead,sourceHeadSha:binding.mainSha,blueprintRef:required(assembly.blueprintRef,"blueprint ref"),digest:required(digest,"digest"),location:required(location,"location"),builtAt:required(builtAt,"builtAt"),status:"BUILT"});
}
export function inspectArtifact({artifact,evidence=[]}={}){
  const digest=String(artifact?.digest||""); const claims=["artifact-loads","source-binding-correct"];
  const used=claims.map(claim=>evidence.find(e=>e?.scope==="artifact"&&e.claim===claim&&e.value?.digest===digest)).filter(Boolean);
  return Object.freeze({status:digest&&used.length===claims.length?"pass":"fail",artifactId:artifact?.id||null,artifactDigest:digest||null,evidenceIds:Object.freeze(used.map(e=>String(e.id))),checkedAt:new Date().toISOString()});
}
