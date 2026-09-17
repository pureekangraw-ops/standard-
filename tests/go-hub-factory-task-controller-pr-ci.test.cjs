"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const controllerUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-factory-task-controller.mjs")).href;
const repository = "pureekangraw-ops/standard-";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

function memoryState() {
  let saved = null;
  return {
    async load() { return saved == null ? null : structuredClone(saved); },
    async save({ expectedRevision, task, receipt, auditEvent }) {
      const current = saved?.revision ?? 0;
      if (expectedRevision !== current) throw new Error("STALE_TASK_REVISION");
      saved = {
        revision: current + 1,
        task: structuredClone(task),
        receipts: [...(saved?.receipts || []), structuredClone(receipt)],
        audit: [...(saved?.audit || []), structuredClone(auditEvent)],
      };
      return { revision: saved.revision, task: structuredClone(task), receipt: structuredClone(receipt) };
    },
  };
}

async function seededController(extra = {}) {
  const { createFactoryController } = await import(controllerUrl + "?prci=" + Date.now() + Math.random());
  const state = memoryState();
  const lifecycle = {
    inspect: async () => jsonResponse({ repository, defaultBranch: "main", branch: "main", baseSha: "base-1", headSha: "base-1", tree: [] }),
    createBranch: async () => jsonResponse({ branch: "feature-a", headSha: "base-1" }, 201),
    putFile: async () => jsonResponse({ ok: true, commit: "commit-2", sha: "blob-2" }),
    compare: async () => jsonResponse({ status: "ahead", aheadBy: 1, behindBy: 0, files: [] }),
    ...extra,
  };
  const controller = createFactoryController({ lifecycle, state, now: () => "2026-09-15T00:00:00.000Z", createId: () => "r-" + Math.random() });
  await controller.execute({ taskId: "task-1", action: "inspect", expectedRevision: 0, input: { repository, intent: "x", branch: "main" } });
  await controller.execute({ taskId: "task-1", action: "create_branch", expectedRevision: 1, input: { name: "feature-a", fromSha: "base-1" } });
  await controller.execute({ taskId: "task-1", action: "write", expectedRevision: 2, input: { path: "x.js", content: "x", expectedSha: "blob-1" } });
  await controller.execute({ taskId: "task-1", action: "compare", expectedRevision: 3, input: {} });
  return { controller, state };
}

test("open_pr rejects a PR whose live head differs from the task head", async () => {
  const { controller } = await seededController({
    openPullRequest: async () => jsonResponse({ number: 41, state: "open", headBranch: "feature-a", headSha: "other", baseBranch: "main", baseSha: "base-1", mergeable: true }),
  });
  await assert.rejects(controller.execute({
    taskId: "task-1", action: "open_pr", expectedRevision: 4,
    input: { title: "Factory bridge", body: "evidence" },
  }), /IDENTITY_MISMATCH/);
});

test("check_ci classifies exact-head runs and never treats zero signals as green", async () => {
  const success = await seededController({
    openPullRequest: async () => jsonResponse({ number: 41, state: "open", headBranch: "feature-a", headSha: "commit-2", baseBranch: "main", baseSha: "base-1", mergeable: true }),
    getCI: async () => jsonResponse({ headSha: "commit-2", runs: [{ id: 77, status: "completed", conclusion: "success", headSha: "commit-2" }], checks: [] }),
  });
  await success.controller.execute({ taskId: "task-1", action: "open_pr", expectedRevision: 4, input: { title: "x", body: "" } });
  const green = await success.controller.execute({ taskId: "task-1", action: "check_ci", expectedRevision: 5, input: {} });
  assert.equal(green.task.state, "CI_GREEN");
  assert.equal(green.task.ci.headSha, "commit-2");

  const empty = await seededController({
    openPullRequest: async () => jsonResponse({ number: 41, state: "open", headBranch: "feature-a", headSha: "commit-2", baseBranch: "main", baseSha: "base-1", mergeable: true }),
    getCI: async () => jsonResponse({ headSha: "commit-2", runs: [], checks: [] }),
  });
  await empty.controller.execute({ taskId: "task-1", action: "open_pr", expectedRevision: 4, input: { title: "x", body: "" } });
  const waiting = await empty.controller.execute({ taskId: "task-1", action: "check_ci", expectedRevision: 5, input: {} });
  assert.notEqual(waiting.task.state, "CI_GREEN");
});

test("diagnose_failure only accepts a failed run already bound to current CI truth", async () => {
  const { controller } = await seededController({
    openPullRequest: async () => jsonResponse({ number: 41, state: "open", headBranch: "feature-a", headSha: "commit-2", baseBranch: "main", baseSha: "base-1", mergeable: true }),
    getCI: async () => jsonResponse({ headSha: "commit-2", runs: [{ id: 77, status: "completed", conclusion: "failure", headSha: "commit-2" }], checks: [] }),
    getFailureEvidence: async ({ runId }) => jsonResponse({ runId, failedJobs: [{ id: 701, failedSteps: [{ number: 4, name: "test", conclusion: "failure" }], logExcerpt: ["AssertionError"] }] }),
  });
  await controller.execute({ taskId: "task-1", action: "open_pr", expectedRevision: 4, input: { title: "x", body: "" } });
  const failed = await controller.execute({ taskId: "task-1", action: "check_ci", expectedRevision: 5, input: {} });
  assert.equal(failed.task.state, "CI_FAILED");
  await assert.rejects(controller.execute({ taskId: "task-1", action: "diagnose_failure", expectedRevision: 6, input: { runId: 88 } }), /IDENTITY_MISMATCH/);
  const diagnosed = await controller.execute({ taskId: "task-1", action: "diagnose_failure", expectedRevision: 6, input: { runId: 77 } });
  assert.equal(diagnosed.receipt.identity.runId, 77);
  assert.equal(diagnosed.receipt.evidence.failedJobs[0].id, 701);
  assert.equal(diagnosed.task.state, "CI_FAILED");
});
