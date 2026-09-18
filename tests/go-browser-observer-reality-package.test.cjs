"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.resolve(__dirname,"..");
const realityPath=path.join(root,".github","workflows","go-browser-observer-reality-package.yml");
const safeFillPath=path.join(root,".github","workflows","go-browser-extension-sign.yml");
const configPath=path.join(root,"wrangler.go-hub-observer-reality.jsonc");
function read(file){assert.equal(fs.existsSync(file),true,`missing ${path.basename(file)}`);return fs.readFileSync(file,"utf8")}

test("Observer Reality workflow is branch-runnable without changing Safe Fill signing policy",()=>{
  const reality=read(realityPath);
  const safeFill=read(safeFillPath);
  assert.match(reality,/name:\s*GO Browser Observer Reality Package/);
  assert.match(reality,/workflow_dispatch:/);
  assert.match(reality,/push:\s*\n\s*branches:\s*\n\s*-\s*work\/go-browser-observer-eye-v1/);
  assert.match(reality,/paths:\s*\n\s*-\s*['"]?\.github\/workflows\/go-browser-observer-reality-package\.yml['"]?/);
  assert.match(safeFill,/name:\s*GO Browser Extension Sign/);
  assert.match(safeFill,/workflow_dispatch:/);
  assert.doesNotMatch(safeFill,/\n\s*push:/);
});

test("Safe Fill manual signing path remains unchanged",()=>{
  const workflow=read(safeFillPath);
  for(const marker of["build:go-browser-extension","dist/go-browser-local-v1","go-browser-local-v1-unsigned.xpi","go-browser-local-v1-signed-${{ github.sha }}"])
    assert.equal(workflow.includes(marker),true,`missing Safe Fill marker: ${marker}`);
});

test("Observer Reality path never merges or deploys production GO Hub",()=>{
  const workflow=read(realityPath);
  assert.doesNotMatch(workflow,/\n\s*pull_request:/);
  assert.doesNotMatch(workflow,/go_hub_merge|gh\s+pr\s+merge|--config\s+wrangler\.go-hub\.jsonc/);
  assert.match(workflow,/wrangler\.go-hub-observer-reality\.jsonc/);
});

test("Reality Worker is isolated and contains only Observer session durable state",()=>{
  const config=JSON.parse(read(configPath));
  assert.equal(config.name,"go-hub-eye-reality");
  assert.equal(config.main,"go-hub-edge-worker.mjs");
  assert.equal(config.workers_dev,true);
  assert.deepEqual(config.durable_objects.bindings,[{name:"OBSERVER_SESSIONS",class_name:"ObserverSessionRegistry"}]);
  assert.equal(JSON.stringify(config).includes("HEPHAESTUS"),false);
  assert.equal(JSON.stringify(config).includes("GO_HUB_FACTORY_STATE"),false);
  assert.deepEqual(config.vars.BROWSER_POLICY,{allowedHostnames:["gumroad.com","*.gumroad.com"],requireOwnerPasscode:true});
});

test("Observer Reality gates source, deploys isolated Hub, signs and hashes the XPI",()=>{
  const workflow=read(realityPath);
  for(const marker of[
    "npm run deploy:gate","CLOUDFLARE_API_TOKEN","CLOUDFLARE_ACCOUNT_ID","GOHUB_OWNER_PASSCODE",
    "AMO_SIGN_KEY","AMO_SIGN_SECRET","accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/subdomain",
    "go-hub-eye-reality","/hub/observer","build:go-browser-observer-extension",
    "kewisch/action-web-ext@84a13bb9e1b6108c43788ba091c41ca1dba6ad45","channel: unlisted",
    "sha256sum","observer-reality-manifest.json","github.sha","actions/upload-artifact@v4"
  ]) assert.equal(workflow.includes(marker),true,`missing reality marker: ${marker}`);
});

test("signed Observer identity is verified and handoff filename is deterministic",()=>{
  const workflow=read(realityPath);
  for(const marker of[
    "Verify signed Observer identity",
    "unzip -p \"${SIGNED_TARGET}\" manifest.json",
    "GO Browser Local Observer Eye",
    "go-browser-local-observer-v1@pureekangraw.local",
    "go-browser-local-observer-v1-signed.xpi"
  ]) assert.equal(workflow.includes(marker),true,`missing signed identity marker: ${marker}`);
});

test("Reality artifact keeps signed XPI and manifest together for owner handoff",()=>{
  const workflow=read(realityPath);
  assert.match(workflow,/go-browser-observer-reality-\$\{\{ github\.sha \}\}/);
  assert.match(workflow,/observer-reality-manifest\.json/);
  assert.match(workflow,/go-browser-local-observer-v1-signed\.xpi/);
});
