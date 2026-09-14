"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = pathToFileURL(path.join(root, "go-hub-code-task.js")).href;

async function load() {
  return import(`${moduleUrl}?task=${Date.now()}-${Math.random()}`);
}

test("task advances inspect to branch/edit/diff with SHA-bound evidence", async () => {
  const { createCodeTask } = await load();
  let task = createCodeTask({ id: "task-1", intent: "edit hub", repository: "pureekangraw-ops/standard-" });
  assert.equal(task.state, "INSPECTING");
  assert.equal(task.nextAction, "inspect");

  task = task.transition("BRANCH_READY", { baseBranch: "main", baseSha: "base-1", workBranch: "feature-a", headSha: "head-1" });
  assert.equal(task.nextAction, "edit");
  task = task.transition("EDITING", { headSha: "head-1", touchedPaths: ["src/app.js"] });
  task = task.transition("DIFF_REVIEWED", { headSha: "head-1", diffFingerprint: "diff-1" });
  assert.equal(task.nextAction, "test");
  assert.equal(task.snapshot().diffFingerprint, "diff-1");
  assert.equal(task.snapshot().audit.length >= 3, true);
});

test("task enters explicit conflict and blocker states", async () => {
  const { createCodeTask } = await load();
  let task = createCodeTask({ id: "task-2", intent: "edit hub", repository: "pureekangraw-ops/standard-" });
  task = task.transition("CONFLICT", { blocker: "base diverged", headSha: "head-2" });
  assert.equal(task.state, "CONFLICT");
  assert.equal(task.blocker, "base diverged");
  assert.equal(task.nextAction, "resolve-conflict");
  task = task.transition("BLOCKED", { blocker: "manual approval" });
  assert.equal(task.state, "BLOCKED");
  assert.equal(task.nextAction, "resolve-blocker");
});

test("changing head invalidates reviewed diff evidence", async () => {
  const { createCodeTask } = await load();
  let task = createCodeTask({ id: "task-3", intent: "edit hub", repository: "pureekangraw-ops/standard-" });
  task = task.transition("BRANCH_READY", { baseBranch: "main", baseSha: "base-1", workBranch: "feature-a", headSha: "head-1" });
  task = task.transition("DIFF_REVIEWED", { headSha: "head-1", diffFingerprint: "diff-1" });
  task = task.transition("EDITING", { headSha: "head-2", touchedPaths: ["src/app.js"] });
  const snapshot = task.snapshot();
  assert.equal(snapshot.headSha, "head-2");
  assert.equal(snapshot.diffFingerprint, null);
  assert.equal(snapshot.nextAction, "review-diff");
});
