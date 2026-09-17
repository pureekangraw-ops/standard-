"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const path=require("node:path");
const {pathToFileURL}=require("node:url");
const root=path.resolve(__dirname,"..");
const housekeeperUrl=pathToFileURL(path.join(root,"go-hub-housekeeper.js")).href;
const factoryReturnUrl=pathToFileURL(path.join(root,"go-hub-factory-return.js")).href;
const codeModuleUrl=pathToFileURL(path.join(root,"go-hub-code-module.js")).href;
const centreUrl=pathToFileURL(path.join(root,"go-hub-centre.js")).href;

async function factoryAccess(){
  const {createCentrePassage,admitDestination}=await import(`${centreUrl}?close=${Date.now()}-${Math.random()}`);
  const centre=createCentrePassage();
  const ready=centre.fit(centre.review(centre.enter({checkpointId:"CENTRE-CLOSE",workId:"WORK-CLOSE"}),{task:"Close Factory truth",requestedResult:"Return final product truth",authority:"BIG"}),{lensId:"LENS-CLOSE",lensReference:"lens://close",fittedView:"Return canonical final truth"});
  const away=centre.leave(ready,{destination:"destination://factory"}).work;
  return admitDestination(away,{destination:"destination://factory",capability:{id:"code",status:"ready"}});
}

function apkTruth(){return{
  id:"apk-close",repository:"pureekangraw-ops/ygph-metropolis",state:"CI_GREEN",nextAction:"complete",blocker:null,factoryStage:"VERIFIED_CHAIN",
  mergeGate:{status:"MERGED_VERIFIED",mainSha:"main-head"},
  buildArtifact:{id:"unsigned-apk",kind:"apk",status:"BUILT",digest:"unsigned-digest",sourceHeadSha:"main-head"},
  signingGate:{state:"SIGNING_GATE_READY",sourceArtifactId:"unsigned-apk",unsignedApkSha256:"unsigned-digest",sourceSha:"main-head",signingProfileId:"prod"},
  signedArtifact:{id:"signed-apk",kind:"apk",status:"SIGNATURE_VERIFIED",sourceArtifactId:"unsigned-apk",sourceHeadSha:"main-head",digest:"signed-digest",certificateSha256:"cert"},
  signatureEvidence:{sourceSha:"main-head",unsignedApkSha256:"unsigned-digest",signedApkSha256:"signed-digest",certificateSha256:"cert",verificationResult:"pass"},
  productQc:{status:"pass",artifactId:"signed-apk",artifactDigest:"signed-digest"},
  publication:{status:"PUBLISHED",artifactId:"signed-apk",artifactDigest:"signed-digest",sourceSha:"main-head",deployment:{runId:77,sha:"main-head",status:"success",target:"https://app.example"}},
  observation:{status:"pass",artifactId:"signed-apk",artifactDigest:"signed-digest",publicationRunId:77,target:"https://app.example/health",kind:"http",evidence:{status:200}},
  verificationScan:{status:"VERIFIED_CHAIN",artifactId:"signed-apk",artifactDigest:"signed-digest"},
  closeout:{status:"CLOSEOUT_READY",taskId:"apk-close",finalArtifact:{id:"signed-apk",digest:"signed-digest"}},
  lessons:[],evidence:[],
};}

test("Housekeeper closes the final signed APK, never the unsigned Build artifact",async()=>{
  const {planCloseout}=await import(`${housekeeperUrl}?apk=${Date.now()}`);
  const task=apkTruth();
  const closeout=planCloseout({task,scan:task.verificationScan});
  assert.deepEqual(closeout.finalArtifact,{id:"signed-apk",digest:"signed-digest"});
});

test("Housekeeper keeps non-APK Build artifact as final product",async()=>{
  const {planCloseout}=await import(`${housekeeperUrl}?web=${Date.now()}`);
  const task={id:"web-close",factoryStage:"VERIFIED_CHAIN",buildArtifact:{id:"web",kind:"web",digest:"web-digest"}};
  const scan={status:"VERIFIED_CHAIN",artifactId:"web",artifactDigest:"web-digest"};
  assert.deepEqual(planCloseout({task,scan}).finalArtifact,{id:"web",digest:"web-digest"});
});

test("Factory return exposes canonical final product and the full downstream truth chain",async()=>{
  const {createFactoryRealityReturn}=await import(`${factoryReturnUrl}?final=${Date.now()}`);
  const packet=createFactoryRealityReturn(await factoryAccess(),apkTruth());
  assert.deepEqual(packet.payload.artifact,apkTruth().signedArtifact);
  assert.deepEqual(packet.payload.buildArtifact,apkTruth().buildArtifact);
  assert.deepEqual(packet.payload.signingGate,apkTruth().signingGate);
  assert.deepEqual(packet.payload.signedArtifact,apkTruth().signedArtifact);
  assert.deepEqual(packet.payload.publication,apkTruth().publication);
  assert.deepEqual(packet.payload.observation,apkTruth().observation);
  assert.deepEqual(packet.payload.mergeGate,apkTruth().mergeGate);
});

test("Code capability projects every canonical Factory truth needed to resume without chat",async()=>{
  const {createCodeCapability}=await import(`${codeModuleUrl}?final=${Date.now()}`);
  const capability=createCodeCapability({task:apkTruth()});
  assert.deepEqual(capability.mergeGate,apkTruth().mergeGate);
  assert.deepEqual(capability.signingGate,apkTruth().signingGate);
  assert.deepEqual(capability.signedArtifact,apkTruth().signedArtifact);
  assert.deepEqual(capability.publication,apkTruth().publication);
  assert.deepEqual(capability.observation,apkTruth().observation);
  assert.deepEqual(capability.finalArtifact,apkTruth().signedArtifact);
});
