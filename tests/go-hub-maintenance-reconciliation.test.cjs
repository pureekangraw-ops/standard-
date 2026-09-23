"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),path=require("node:path");
const {pathToFileURL}=require("node:url");
const url=pathToFileURL(path.resolve(__dirname,"..","go-hub-maintenance-reconciliation.js")).href;
function fixture(){
 const waitingRecord={repository:"pureekangraw-ops/standard-",goId:"old-go",jobId:"old-job",status:"WAITING_VERIFICATION",mainSha:"merge-1",mergeGate:{merge:{pullRequestNumber:111,headSha:"head-1",mergeSha:"merge-1"}}};
 return {waitingRecord,pullRequest:{number:111,state:"closed",merged:true,headSha:"head-1"}};
}
test("legacy reconciliation removes only source-bound merged waiting truth",async()=>{
 const {reconcileLegacyWaitingRoom}=await import(url+"?a="+Date.now());
 const evidence=fixture(); const state={version:1,repositories:{"pureekangraw-ops/standard-":{waitingRoom:[evidence.waitingRecord]}}};
 const result=reconcileLegacyWaitingRoom(state,evidence);
 assert.equal(result.outcome.status,"LEGACY_RECONCILED"); assert.equal(result.state.repositories["pureekangraw-ops/standard-"].waitingRoom.length,0);
});
test("legacy reconciliation fails closed when PR is not merged",async()=>{
 const {planLegacyWaitingReconciliation}=await import(url+"?b="+Date.now());
 const evidence=fixture(); evidence.pullRequest.merged=false;
 assert.throws(()=>planLegacyWaitingReconciliation(evidence),/merged pull request truth/);
});
test("legacy reconciliation fails closed on mismatched merge identity",async()=>{
 const {planLegacyWaitingReconciliation}=await import(url+"?c="+Date.now());
 const evidence=fixture(); evidence.pullRequest.headSha="other";
 assert.throws(()=>planLegacyWaitingReconciliation(evidence),/head does not match/);
});
