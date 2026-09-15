"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const controllerUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-factory-controller.mjs")).href;
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
      saved = { revision: current + 1, task: structuredClone(task), receipts: [...(saved?.receipts || []), structuredClone(receipt)], audit: [...(saved?.audit || []), structuredClone(auditEvent)] };
      return { revision: saved.revision, task: structuredClone(task), receipt: structuredClone(receipt) };
    },
  };
}

async function seeded(extra = {}) {
  const { createFactoryController } = await import(controllerUrl + "?reconcile=" + Date.now() + Math.random());
  const state = memoryState();
  let writeCalls = 0;
  const lifecycle = {
    inspect: async ({ branch }) => jsonResponse({ repository, defaultBranch: "main", branch: branch || "main", baseSha: "base-1", headSha: branch ? "base-1" : "base-1", tree: [] }),
    createBranch: async () => jsonResponse({ branch: "feature-a", headSha: "base-1" }, 201),
    putFile: async () => { writeCalls += 1; return jsonResponse({ ok: true, commit: "commit-2", sha: "blob-2" }); },
    ...extra,
  };
  const controller = createFactoryController({ lifecycle, state, now: () => "now", createId: () => "r-" + Math.random() });
  await controller.execute({ taskId: "task-1", action: "inspect", expectedRevision: 0, input: { repository, intent: "x", branch: "main" } });
  await controller.execute({ taskId: "task-1", action: "create_branch", expectedRevision: 1, input: { name: "feature-a", fromSha: "base-1" } });
  return { controller, state, getWriteCalls: () => writeCalls };
}

test("external branch advancement invalidates stale task before mutation", async () => {
  const { controller, getWriteCalls } = await seeded({
    inspect: async ({ branch }) => jsonResponse({ repository, defaultBranch: "main", branch: branch || "main", baseSha: "base-1", headSha: branch ? "head-2" : "base-1", tree: [] }),
  });
  const result = await controller.execute({ taskId: "task-1", action: "write", expectedRevision: 2, input: { path: "x.js", content: "x", expectedSha: "blob-1" } });
  assert.equal(result.status, "STALE_TASK");
  assert.equal(result.reconciliation.status, "ADVANCED_EXTERNALLY");
  assert.equal(result.reconciliation.observedHeadSha, "head-2");
  assert.equal(result.task.headSha, "head-2");
  assert.equal(getWriteCalls(), 0);
});

test("missing work branch fails closed before mutation", async () => {
  const { controller, getWriteCalls } = await seeded({
    inspect: async ({ branch }) => branch
      ? jsonResponse({ code: "BRANCH_NOT_FOUND" }, 404)
      : jsonResponse({ repository, defaultBranch: "main", branch: "main", baseSha: "base-1", headSha: "base-1", tree: [] }),
  });
  const result = await controller.execute({ taskId: "task-1", action: "write", expectedRevision: 2, input: { path: "x.js", content: "x", expectedSha: "blob-1" } });
  assert.equal(result.status, "MISSING");
  assert.equal(result.reconciliation.status, "MISSING");
  assert.match(result.task.blocker, /feature-a/);
  assert.equal(getWriteCalls(), 0);
});

test("contradictory PR and live branch identity becomes conflict", async () => {
  const { createFactoryController } = await import(controllerUrl + "?prdrift=" + Date.now());
  const state = memoryState();
  const lifecycle = {
    inspect: async ({ branch }) => jsonResponse({ repository, defaultBranch: "main", branch: branch || "main", baseSha: "base-1", headSha: branch ? "head-2" : "base-1", tree: [] }),
    createBranch: async () => jsonResponse({ branch: "feature-a", headSha: "base-1" }, 201),
    openPullRequest: async () => jsonResponse({ number: 41, state: "open", headBranch: "feature-a", headSha: "base-1", baseBranch: "main", baseSha: "base-1", mergeable: true }),
    getPullRequest: async () => jsonResponse({ number: 41, state: "open", headBranch: "feature-a", headSha: "other-head", baseBranch: "main", baseSha: "base-1", mergeable: true }),
    putFile: async () => { throw new Error("mutation must not run"); },
  };
  const controller = createFactoryController({ lifecycle, state, now: () => "now", createId: () => "r-" + Math.random() });
  await controller.execute({ taskId: "task-1", action: "inspect", expectedRevision: 0, input: { repository, intent: "x", branch: "main" } });
  await controller.execute({ taskId: "task-1", action: "create_branch", expectedRevision: 1, input: { name: "feature-a", fromSha: "base-1" } });
  await controller.execute({ taskId: "task-1", action: "open_pr", expectedRevision: 2, input: { title: "x", body: "" } });
  const result = await controller.execute({ taskId: "task-1", action: "write", expectedRevision: 3, input: { path: "x.js", content: "x", expectedSha: "blob" } });
  assert.equal(result.status, "CONFLICT");
  assert.equal(result.reconciliation.status, "CONFLICT");
  assert.match(result.task.blocker, /PR 41/);
});
