"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = pathToFileURL(path.join(root, "go-hub-code-module.js")).href;

async function load() {
  return import(`${moduleUrl}?contract=${Date.now()}-${Math.random()}`);
}

function lifecycleWorkspace(overrides = {}) {
  return {
    listFiles() {},
    readText() {},
    writeText() {},
    createBranch() {},
    compare() {},
    openPullRequest() {},
    getPullRequest() {},
    getCI() {},
    rerunFailed() {},
    mergePullRequest() {},
    getWorkflowRuns() {},
    ...overrides,
  };
}

test("Code full readiness requires recursive inspect and delete contracts", async () => {
  const { createCodeCapability } = await load();

  const missingInspectAndDelete = createCodeCapability({ workspace: lifecycleWorkspace() });
  assert.notEqual(missingInspectAndDelete.status, "ready");
  assert.equal(missingInspectAndDelete.canInspect, false);
  assert.equal(missingInspectAndDelete.canDelete, false);

  const full = createCodeCapability({
    workspace: lifecycleWorkspace({ inspect() {}, listTree() {}, deletePath() {}, factoryAction() {} }),
    controllerReady: true,
  });
  assert.equal(full.canInspect, true);
  assert.equal(full.canDelete, true);
  assert.equal(full.status, "ready");
});
