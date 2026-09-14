function list(value){return Object.freeze([...(Array.isArray(value)?value:[])].map(String));}
export function planCloseout({task={},scan={},transientKeys=[],obsoleteKeys=[]}={}){
  if(!["PRODUCT_VERIFIED","VERIFIED_CHAIN"].includes(task.factoryStage))throw new Error("PRODUCT_VERIFIED task is required");
  if(scan.status!=="VERIFIED_CHAIN")throw new Error("VERIFIED_CHAIN scan is required");
  const artifact=task.buildArtifact;
  if(!artifact?.id||!artifact.digest||scan.artifactId!==artifact.id||scan.artifactDigest!==artifact.digest)throw new Error("scan must match current Artifact");
  return Object.freeze({status:"CLOSEOUT_READY",taskId:String(task.id),finalArtifact:Object.freeze({id:String(artifact.id),digest:String(artifact.digest)}),transientKeys:list(transientKeys),obsoleteKeys:list(obsoleteKeys),plannedAt:new Date().toISOString()});
}
