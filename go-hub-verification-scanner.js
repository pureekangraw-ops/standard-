const stations=[
  ["blueprint","mount-approved-blueprint",t=>Boolean(t.blueprint?.ref&&t.blueprint.status==="approved")],
  ["piece-qc","rerun-piece-qc",t=>Boolean(t.piece?.headSha&&t.pieceQc?.status==="pass"&&t.pieceQc.checkedHeadSha===t.piece.headSha)],
  ["ready-gate","reseal-ready-gate",t=>Boolean(t.gateHandoff?.status==="READY_FOR_ASSEMBLY"&&t.gateHandoff.headSha===t.piece?.headSha&&t.gateHandoff.blueprintRef===t.blueprint?.ref)],
  ["assembly-qc","rerun-assembly-qc",t=>Boolean(t.assembly?.status==="ASSEMBLED"&&t.assembly.blueprintRef===t.blueprint?.ref&&t.assemblyQc?.status==="pass"&&t.assemblyQc.checkedHeadSha===t.assembly.integrationHeadSha)],
  ["merge-gate","reseal-merge-gate",t=>Boolean(t.mergeGate?.status==="MERGED_VERIFIED"&&t.mergeGate.assemblyId===t.assembly?.id&&t.mergeGate.sourceHeadSha===t.assembly?.integrationHeadSha&&t.mergeGate.pullRequestHeadSha===t.assembly?.integrationHeadSha&&t.mergeGate.ciHeadSha===t.mergeGate.pullRequestHeadSha&&t.mergeGate.mergeSha&&t.mergeGate.mainSha===t.mergeGate.mergeSha)],
  ["artifact","rebuild-artifact",t=>Boolean(t.buildArtifact?.status==="BUILT"&&t.buildArtifact.sourceHeadSha===t.mergeGate?.mainSha&&t.buildArtifact.assemblyHeadSha===t.assembly?.integrationHeadSha&&t.buildArtifact.blueprintRef===t.blueprint?.ref&&t.buildArtifact.digest)],
  ["product-qc","rerun-product-qc",t=>Boolean(t.factoryStage==="PRODUCT_VERIFIED"&&t.productQc?.status==="pass"&&t.productQc.artifactId===t.buildArtifact?.id&&t.productQc.artifactDigest===t.buildArtifact?.digest)],
];
export function scanFactoryTruth(truth={}){
  const checked=[];
  for(const [station,recoveryAction,valid] of stations){checked.push(station);if(!valid(truth))return Object.freeze({status:"FIRST_BROKEN_TRUTH",station,reason:`${station} truth is missing, failed, or stale`,recoveryAction,checkedStations:Object.freeze(checked)});}
  return Object.freeze({status:"VERIFIED_CHAIN",artifactId:String(truth.buildArtifact.id),artifactDigest:String(truth.buildArtifact.digest),blueprintRef:String(truth.blueprint.ref),checkedStations:Object.freeze(checked),scannedAt:new Date().toISOString()});
}
