"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {pathToFileURL}=require("node:url");
const root=path.resolve(__dirname,"..");
const url=pathToFileURL(path.join(root,"go-hub-operator-model.js")).href;

test("Operator view is read-only evidence derived from current task truth",async()=>{
  const {createOperatorView}=await import(url);
  const view=createOperatorView({
    repository:"pureekangraw-ops/standard-",
    state:"CI_GREEN",
    baseSha:"base",
    workBranch:"work/task",
    headSha:"head",
    pullRequest:{number:91},
    ci:{status:"success"},
    deployment:{status:"success"},
    verification:{status:"success"},
  });
  assert.equal(view.repository,"pureekangraw-ops/standard-");
  assert.equal(view.pullRequest,"#91");
  assert.equal(view.ci,"success");
  assert.equal(view.readOnly,true);
});

test("Operator view exposes recovery instead of cancellation after Reality exists",async()=>{
  const {createOperatorView}=await import(url);
  const view=createOperatorView({state:"VERIFY_FAILED",repository:"repo"});
  assert.equal(view.interruption.state,"RECOVERY_REQUIRED");
  assert.equal(view.interruption.cancellable,false);
});

test("Operator surface contains evidence fields but no direct inspect or transition control",()=>{
  const html=fs.readFileSync(path.join(root,"go-hub.html"),"utf8");
  const shell=fs.readFileSync(path.join(root,"go-hub-shell.js"),"utf8");
  for(const marker of[
    "data-code-operator","data-code-state","data-code-repository","data-code-base",
    "data-code-work-branch","data-code-head","data-code-pr","data-code-ci",
    "data-code-deploy","data-code-verification","data-code-blocker","data-code-next-action"
  ]) assert.match(html,new RegExp(marker));
  assert.doesNotMatch(html,/data-code-inspect/);
  assert.doesNotMatch(shell,/task\.transition\("BRANCH_READY"/);
});
