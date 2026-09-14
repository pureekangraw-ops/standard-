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


test("deploy success remains incomplete until successful verification evidence", async () => {
  const { createCodeTask } = await load();
  let task = createCodeTask({ id: "task-deploy", repository: "pureekangraw-ops/standard-" });
  task = task.transition("BRANCH_READY", {
    baseBranch: "main", baseSha: "base-d", workBranch: "feature-d", headSha: "head-d",
  });
  task = task.transition("CI_GREEN", {
    headSha: "head-d", ci: { headSha: "head-d", conclusion: "success" },
  });
  task = task.transition("MERGED", {
    headSha: "head-d", merge: { headSha: "head-d", mergeSha: "merge-d", pullRequestNumber: 19 },
  });
  task = task.transition("DEPLOYING", {
    deployment: { sha: "merge-d", runId: 91, status: "in_progress" },
  });
  task = task.transition("DEPLOYED", {
    deployment: { sha: "merge-d", runId: 91, status: "success" },
  });
  assert.equal(task.state, "DEPLOYED");
  assert.equal(task.nextAction, "verify");
  assert.throws(() => task.transition("VERIFIED"), /successful verification evidence is required/);
  task = task.transition("VERIFIED", {
    verification: {
      kind: "http", target: "https://hub.example/health", status: "success",
      evidence: { status: 200 }, timestamp: "2026-09-14T05:30:00.000Z",
    },
  });
  assert.equal(task.state, "VERIFIED");
  assert.equal(task.nextAction, "complete");
  assert.equal(task.snapshot().verification.status, "success");
});

test("task exposes explicit rollback entries for edits, branch commits, and merged code", async () => {
  const { createCodeTask } = await load();
  const cases = [
    { from: "EDITING", kind: "discard-pending-edits" },
    { from: "COMMITTED", kind: "reset-work-branch" },
    { from: "MERGED", kind: "revert-merge" },
  ];
  for (const item of cases) {
    let task = createCodeTask({ id: "rollback-" + item.from, repository: "pureekangraw-ops/standard-" });
    task = task.transition("BRANCH_READY", {
      baseBranch: "main", baseSha: "base-d", workBranch: "feature-d", headSha: "head-d",
    });
    task = task.transition(item.from, { headSha: "head-d" });
    task = task.transition("ROLLBACK_IN_PROGRESS", {
      rollback: { kind: item.kind, reason: "operator requested", headSha: "head-d" },
    });
    assert.equal(task.nextAction, "continue-rollback");
    assert.equal(task.snapshot().rollback.kind, item.kind);
  }
});

test("task rejects a rollback kind that does not match the current lifecycle state", async () => {
  const { createCodeTask } = await load();
  let task = createCodeTask({ id: "rollback-invalid", repository: "pureekangraw-ops/standard-" });
  task = task.transition("BRANCH_READY", {
    baseBranch: "main", baseSha: "base-d", workBranch: "feature-d", headSha: "head-d",
  });
  task = task.transition("EDITING", { headSha: "head-d" });
  assert.throws(() => task.transition("ROLLBACK_IN_PROGRESS", {
    rollback: { kind: "revert-merge", headSha: "head-d" },
  }), /rollback kind does not match current state/);
});


test("task restores exact durable snapshot and appends specialist audit to one authority record", async () => {
  const { createCodeTaskFromSnapshot } = await load();
  const stored = {
    id: "task-resume", intent: "continue", repository: "pureekangraw-ops/standard-",
    state: "CI_RUNNING", nextAction: "check-ci", baseBranch: "main", baseSha: "base-1",
    workBranch: "feature-a", headSha: "head-1", touchedPaths: ["src/app.js"],
    diffFingerprint: "diff-1", blocker: null, pullRequest: { number: 19, headSha: "head-1" },
    ci: { headSha: "head-1", conclusion: null }, merge: null, deployment: null,
    verification: null, rollback: null, audit: [{ at: "2026-09-14T00:00:00.000Z", event: "CI_STARTED" }],
  };
  let task = createCodeTaskFromSnapshot(stored);
  assert.deepEqual(task.snapshot(), stored);
  task = task.appendAudit("SPECIALIST_RETURN", { specialist: "slice-c", result: "green" });
  const resumed = task.snapshot();
  assert.equal(resumed.id, stored.id);
  assert.equal(resumed.audit.length, 2);
  assert.equal(resumed.audit[1].event, "SPECIALIST_RETURN");
  assert.equal(resumed.audit[1].specialist, "slice-c");
  assert.equal(resumed.audit[1].result, "green");
});
