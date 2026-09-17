function list(value){return Object.freeze([...(Array.isArray(value)?value:[])].map(String));}
function finalProductArtifact(task={}){
  return String(task.buildArtifact?.kind||"").toLowerCase()==="apk" ? task.signedArtifact : task.buildArtifact;
}
export function planCloseout({task={},scan={},transientKeys=[],obsoleteKeys=[]}={}){
  if(!["PRODUCT_VERIFIED","VERIFIED_CHAIN"].includes(task.factoryStage))throw new Error("verified Product task is required");
  if(scan.status!=="VERIFIED_CHAIN")throw new Error("VERIFIED_CHAIN scan is required");
  const artifact=finalProductArtifact(task);
  if(!artifact?.id||!artifact.digest||scan.artifactId!==artifact.id||scan.artifactDigest!==artifact.digest)throw new Error("scan must match current final Product Artifact");
  return Object.freeze({status:"CLOSEOUT_READY",taskId:String(task.id),finalArtifact:Object.freeze({id:String(artifact.id),digest:String(artifact.digest)}),transientKeys:list(transientKeys),obsoleteKeys:list(obsoleteKeys),plannedAt:new Date().toISOString()});
}
