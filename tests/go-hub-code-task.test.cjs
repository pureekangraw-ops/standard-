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


test("a new head invalidates prior PR CI evidence", async () => {
  const { createCodeTask } = await load();
  let task = createCodeTask({ id: "task-ci", repository: "pureekangraw-ops/standard-" });
  task = task.transition("BRANCH_READY", {
    baseBranch: "main", baseSha: "base-1", workBranch: "feature-a", headSha: "head-1",
  });
  task = task.transition("PR_OPEN", {
    headSha: "head-1", pullRequest: { number: 19, headSha: "head-1" },
  });
  task = task.transition("CI_GREEN", {
    headSha: "head-1", ci: { headSha: "head-1", conclusion: "success" },
  });
  assert.equal(task.snapshot().ci.conclusion, "success");

  task = task.transition("EDITING", { headSha: "head-2", touchedPaths: ["src/app.js"] });
  const snapshot = task.snapshot();
  assert.equal(snapshot.pullRequest, null);
  assert.equal(snapshot.ci, null);
  assert.equal(snapshot.nextAction, "review-diff");
});


test("task binds committed PR and CI transitions to the current head", async () => {
  const { createCodeTask } = await load();
  let task = createCodeTask({ id: "task-pr-ci", repository: "pureekangraw-ops/standard-" });
  task = task.transition("BRANCH_READY", {
    baseBranch: "main", baseSha: "base-1", workBranch: "feature-c", headSha: "head-c",
  });
  task = task.transition("COMMITTED", { headSha: "head-c" });
  assert.equal(task.nextAction, "open-pr");
  task = task.transition("PR_OPEN", {
    headSha: "head-c",
    pullRequest: { number: 19, headBranch: "feature-c", headSha: "head-c", baseBranch: "main" },
  });
  assert.equal(task.nextAction, "check-ci");
  task = task.transition("CI_RUNNING", {
    headSha: "head-c", ci: { headSha: "head-c", conclusion: null, runs: [{ id: 7, status: "in_progress" }] },
  });
  assert.equal(task.nextAction, "check-ci");
  task = task.transition("CI_FAILED", {
    headSha: "head-c", ci: { headSha: "head-c", conclusion: "failure", runs: [{ id: 7, conclusion: "failure" }] },
  });
  assert.equal(task.nextAction, "fix-ci");
  task = task.transition("CI_GREEN", {
    headSha: "head-c", ci: { headSha: "head-c", conclusion: "success", runs: [{ id: 8, conclusion: "success" }] },
  });
  assert.equal(task.nextAction, "merge");
});

test("task rejects PR or CI evidence for a different head SHA", async () => {
  const { createCodeTask } = await load();
  let task = createCodeTask({ id: "task-stale", repository: "pureekangraw-ops/standard-" });
  task = task.transition("BRANCH_READY", {
    baseBranch: "main", baseSha: "base-1", workBranch: "feature-c", headSha: "head-current",
  });
  assert.throws(() => task.transition("PR_OPEN", {
    headSha: "head-current",
    pullRequest: { number: 19, headSha: "head-stale" },
  }), /pull request head SHA does not match current head/);
  assert.throws(() => task.transition("CI_GREEN", {
    headSha: "head-current",
    ci: { headSha: "head-stale", conclusion: "success" },
  }), /CI head SHA does not match current head/);
});
