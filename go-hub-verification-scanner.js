function productArtifact(truth={}){
  return String(truth.buildArtifact?.kind||"").toLowerCase()==="apk" ? truth.signedArtifact : truth.buildArtifact;
}
const baseStations=[
  ["blueprint","mount-approved-blueprint",t=>Boolean(t.blueprint?.ref&&t.blueprint.status==="approved")],
  ["piece-qc","rerun-piece-qc",t=>Boolean(t.piece?.headSha&&t.pieceQc?.status==="pass"&&t.pieceQc.checkedHeadSha===t.piece.headSha)],
  ["ready-gate","reseal-ready-gate",t=>Boolean(t.gateHandoff?.status==="READY_FOR_ASSEMBLY"&&t.gateHandoff.headSha===t.piece?.headSha&&t.gateHandoff.blueprintRef===t.blueprint?.ref)],
  ["assembly-qc","rerun-assembly-qc",t=>Boolean(t.assembly?.status==="ASSEMBLED"&&t.assembly.blueprintRef===t.blueprint?.ref&&t.assemblyQc?.status==="pass"&&t.assemblyQc.checkedHeadSha===t.assembly.integrationHeadSha)],
  ["merge-gate","reseal-merge-gate",t=>Boolean(t.mergeGate?.status==="MERGED_VERIFIED"&&t.mergeGate.assemblyId===t.assembly?.id&&t.mergeGate.sourceHeadSha===t.assembly?.integrationHeadSha&&t.mergeGate.pullRequestHeadSha===t.assembly?.integrationHeadSha&&t.mergeGate.ciHeadSha===t.mergeGate.pullRequestHeadSha&&t.mergeGate.mergeSha&&t.mergeGate.mainSha===t.mergeGate.mergeSha)],
  ["artifact","rebuild-artifact",t=>Boolean(t.buildArtifact?.status==="BUILT"&&t.buildArtifact.sourceHeadSha===t.mergeGate?.mainSha&&t.buildArtifact.assemblyHeadSha===t.assembly?.integrationHeadSha&&t.buildArtifact.blueprintRef===t.blueprint?.ref&&t.buildArtifact.digest)],
];
function signingStation(t){
  if(String(t.buildArtifact?.kind||"").toLowerCase()!=="apk")return null;
  return ["signing-gate","reseal-signing-gate",truth=>Boolean(
    truth.signingGate?.state==="SIGNING_GATE_READY"&&truth.signingGate.sourceArtifactId===truth.buildArtifact?.id&&
    truth.signingGate.unsignedApkSha256===truth.buildArtifact?.digest&&truth.signingGate.sourceSha===truth.buildArtifact?.sourceHeadSha&&
    truth.signedArtifact?.status==="SIGNATURE_VERIFIED"&&truth.signedArtifact.sourceArtifactId===truth.buildArtifact?.id&&
    truth.signedArtifact.sourceHeadSha===truth.buildArtifact?.sourceHeadSha&&truth.signedArtifact.digest&&
    truth.signedArtifact.certificateSha256===truth.signingGate.expectedCertificateSha256
  )];
}
function productQcStation(){return ["product-qc","rerun-product-qc",truth=>{const artifact=productArtifact(truth);return Boolean(artifact&&truth.productQc?.status==="pass"&&truth.productQc.artifactId===artifact.id&&truth.productQc.artifactDigest===artifact.digest);}];}
function publicationStation(){return ["publication","republish-product",truth=>{const artifact=productArtifact(truth),p=truth.publication,d=p?.deployment;return Boolean(artifact&&p?.status==="PUBLISHED"&&p.artifactId===artifact.id&&p.artifactDigest===artifact.digest&&p.sourceSha===artifact.sourceHeadSha&&d?.status==="success"&&d.sha===p.sourceSha&&Number(d.runId||0)>0&&String(d.target||"").trim());}];}
function observationStation(){return ["observation","reobserve-product",truth=>{const artifact=productArtifact(truth),p=truth.publication,o=truth.observation;return Boolean(truth.factoryStage==="OBSERVED"&&artifact&&o?.status==="pass"&&o.artifactId===artifact.id&&o.artifactDigest===artifact.digest&&Number(o.publicationRunId||0)===Number(p?.deployment?.runId||0)&&String(o.target||"").trim()&&String(o.kind||"").trim()&&o.evidence!=null&&String(o.observedAt||"").trim());}];}
export function scanFactoryTruth(truth={}){
  const stations=[...baseStations];const signing=signingStation(truth);if(signing)stations.push(signing);stations.push(productQcStation(),publicationStation(),observationStation());
  const checked=[];for(const [station,recoveryAction,valid] of stations){checked.push(station);if(!valid(truth))return Object.freeze({status:"FIRST_BROKEN_TRUTH",station,reason:`${station} truth is missing, failed, or stale`,recoveryAction,checkedStations:Object.freeze(checked)});}
  const artifact=productArtifact(truth);return Object.freeze({status:"VERIFIED_CHAIN",artifactId:String(artifact.id),artifactDigest:String(artifact.digest),blueprintRef:String(truth.blueprint.ref),checkedStations:Object.freeze(checked),scannedAt:new Date().toISOString()});
}
