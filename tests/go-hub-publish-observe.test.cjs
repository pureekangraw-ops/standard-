"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const path=require("node:path");
const {pathToFileURL}=require("node:url");
const root=path.resolve(__dirname,"..");
const taskUrl=pathToFileURL(path.join(root,"go-hub-code-task.js")).href;
const scannerUrl=pathToFileURL(path.join(root,"go-hub-verification-scanner.js")).href;

function productTruth(){
  return {
    blueprint:{ref:"spec.md",status:"approved"},
    piece:{id:"p",headSha:"piece-head"},pieceQc:{status:"pass",checkedHeadSha:"piece-head"},
    gateHandoff:{status:"READY_FOR_ASSEMBLY",headSha:"piece-head",blueprintRef:"spec.md"},
    assembly:{id:"a",status:"ASSEMBLED",integrationHeadSha:"assembly-head",blueprintRef:"spec.md"},
    assemblyQc:{status:"pass",checkedHeadSha:"assembly-head"},
    mergeGate:{status:"MERGED_VERIFIED",assemblyId:"a",sourceHeadSha:"assembly-head",pullRequestHeadSha:"assembly-head",ciHeadSha:"assembly-head",mergeSha:"main-head",mainSha:"main-head"},
    buildArtifact:{id:"artifact",kind:"worker",status:"BUILT",digest:"digest-1",sourceHeadSha:"main-head",assemblyHeadSha:"assembly-head",blueprintRef:"spec.md"},
    productQc:{status:"pass",artifactId:"artifact",artifactDigest:"digest-1"},
    factoryStage:"PRODUCT_VERIFIED",
  };
}

test("Factory requires Publish then Observe before verification scan",async()=>{
  const {createCodeTask,createCodeTaskFromSnapshot}=await import(`${taskUrl}?publish=${Date.now()}`);
  const base=createCodeTask({id:"publish-task",repository:"pureekangraw-ops/standard-"}).snapshot();
  let task=createCodeTaskFromSnapshot({...base,...productTruth()});
  assert.equal(task.nextAction,"publish");
  assert.throws(()=>task.recordObservation({status:"pass"}),/Publication/);

  task=task.recordPublication({
    status:"PUBLISHED",artifactId:"artifact",artifactDigest:"digest-1",sourceSha:"main-head",
    channel:"cloudflare-worker",deployment:{runId:77,sha:"main-head",status:"success",target:"https://hub.example"},
    publishedAt:"2026-09-17T01:00:00.000Z",
  });
  assert.equal(task.factoryStage,"PUBLISHED");
  assert.equal(task.nextAction,"observe");

  task=task.recordObservation({
    status:"pass",artifactId:"artifact",artifactDigest:"digest-1",publicationRunId:77,
    target:"https://hub.example/health",kind:"http",evidence:{status:200},observedAt:"2026-09-17T01:02:00.000Z",
  });
  assert.equal(task.factoryStage,"OBSERVED");
  assert.equal(task.nextAction,"verify-chain");
});

test("Publication and observation reject stale artifact or deployment truth",async()=>{
  const {createCodeTask,createCodeTaskFromSnapshot}=await import(`${taskUrl}?publish-stale=${Date.now()}`);
  const base=createCodeTask({id:"publish-stale"}).snapshot();
  let task=createCodeTaskFromSnapshot({...base,...productTruth()});
  assert.throws(()=>task.recordPublication({status:"PUBLISHED",artifactId:"artifact",artifactDigest:"old",sourceSha:"main-head",channel:"worker",deployment:{runId:1,sha:"main-head",status:"success",target:"x"},publishedAt:"now"}),/current Product Artifact/);
  task=task.recordPublication({status:"PUBLISHED",artifactId:"artifact",artifactDigest:"digest-1",sourceSha:"main-head",channel:"worker",deployment:{runId:1,sha:"main-head",status:"success",target:"x"},publishedAt:"now"});
  assert.throws(()=>task.recordObservation({status:"pass",artifactId:"artifact",artifactDigest:"digest-1",publicationRunId:2,target:"x",kind:"http",evidence:{status:200},observedAt:"now"}),/Publication/);
});

test("Verification Scanner includes exact publication and observation truth",async()=>{
  const {scanFactoryTruth}=await import(`${scannerUrl}?publish=${Date.now()}`);
  const truth={
    ...productTruth(),factoryStage:"OBSERVED",
    publication:{status:"PUBLISHED",artifactId:"artifact",artifactDigest:"digest-1",sourceSha:"main-head",channel:"worker",deployment:{runId:77,sha:"main-head",status:"success",target:"https://hub.example"},publishedAt:"now"},
    observation:{status:"pass",artifactId:"artifact",artifactDigest:"digest-1",publicationRunId:77,target:"https://hub.example/health",kind:"http",evidence:{status:200},observedAt:"now"},
  };
  const result=scanFactoryTruth(truth);
  assert.equal(result.status,"VERIFIED_CHAIN");
  assert.deepEqual(result.checkedStations,["blueprint","piece-qc","ready-gate","assembly-qc","merge-gate","artifact","product-qc","publication","observation"]);
  const broken=scanFactoryTruth({...truth,observation:{...truth.observation,publicationRunId:88}});
  assert.equal(broken.status,"FIRST_BROKEN_TRUTH");
  assert.equal(broken.station,"observation");
});
