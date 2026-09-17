"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const controllerUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-factory-task-controller.mjs")).href;
const repository = "pureekangraw-ops/standard-";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
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

async function readyController(overrides = {}) {
  const { createFactoryController } = await import(controllerUrl + "?ready=" + Date.now() + Math.random());
  const state = overrides.state || memoryState();
  const lifecycle = {
    inspect: async () => jsonResponse({ repository, defaultBranch: "main", branch: "main", baseSha: "base-1", headSha: "base-1", tree: [] }),
    createBranch: async () => jsonResponse({ branch: "feature-a", headSha: "base-1" }, 201),
    ...overrides.lifecycle,
  };
  const controller = createFactoryController({ lifecycle, state, now: () => "2026-09-15T00:00:00.000Z", createId: () => "receipt-" + Math.random() });
  await controller.execute({ taskId: "task-1", action: "inspect", expectedRevision: 0, input: { repository, intent: "Factory bridge", branch: "main" } });
  await controller.execute({ taskId: "task-1", action: "create_branch", expectedRevision: 1, input: { name: "feature-a", fromSha: "base-1" } });
  return { controller, state, lifecycle };
}

test("controller binds inspect and branch reality to one task", async () => {
  const { createFactoryController } = await import(controllerUrl + "?controller=" + Date.now());
  const lifecycle = {
    inspect: async () => jsonResponse({
      repository,
      defaultBranch: "main",
      branch: "main",
      baseSha: "base-1",
      headSha: "base-1",
      tree: [],
    }),
    createBranch: async () => jsonResponse({ branch: "feature-a", headSha: "base-1" }, 201),
  };
  const controller = createFactoryController({
    lifecycle,
    state: memoryState(),
    now: () => "2026-09-15T00:00:00.000Z",
    createId: () => "receipt-1",
  });

  const inspected = await controller.execute({
    taskId: "task-1",
    action: "inspect",
    expectedRevision: 0,
    input: { repository, intent: "Factory bridge", branch: "main" },
  });
  assert.equal(inspected.task.repository, repository);
  assert.equal(inspected.task.baseBranch, "main");
  assert.equal(inspected.task.baseSha, "base-1");
  assert.equal(inspected.revision, 1);

  const branched = await controller.execute({
    taskId: "task-1",
    action: "create_branch",
    expectedRevision: 1,
    input: { name: "feature-a", fromSha: "base-1" },
  });
  assert.equal(branched.task.state, "BRANCH_READY");
  assert.equal(branched.task.workBranch, "feature-a");
  assert.equal(branched.task.headSha, "base-1");
  assert.equal(branched.nextAction, "edit");
});

test("controller fails closed when branch identity mismatches", async () => {
  const { createFactoryController } = await import(controllerUrl + "?mismatch=" + Date.now());
  const state = memoryState();
  const lifecycle = {
    inspect: async () => jsonResponse({ repository, defaultBranch: "main", branch: "main", baseSha: "base-1", headSha: "base-1", tree: [] }),
    createBranch: async () => jsonResponse({ branch: "feature-a", headSha: "wrong-head" }, 201),
  };
  const controller = createFactoryController({ lifecycle, state, now: () => "now", createId: () => "r" });
  await controller.execute({ taskId: "task-1", action: "inspect", expectedRevision: 0, input: { repository, intent: "x", branch: "main" } });
  await assert.rejects(controller.execute({
    taskId: "task-1",
    action: "create_branch",
    expectedRevision: 1,
    input: { name: "feature-a", fromSha: "base-1" },
  }), /IDENTITY_MISMATCH/);
  assert.equal((await state.load()).task.state, "INSPECTING");
});

test("write receipt advances task head from the actual commit", async () => {
  const { controller } = await readyController({
    lifecycle: {
      putFile: async () => jsonResponse({ ok: true, commit: "commit-2", sha: "blob-2" }),
    },
  });
  const result = await controller.execute({
    taskId: "task-1",
    action: "write",
    expectedRevision: 2,
    input: { path: "src/app.js", content: "next", expectedSha: "blob-1" },
  });
  assert.equal(result.receipt.identity.workBranch, "feature-a");
  assert.equal(result.receipt.identity.headSha, "commit-2");
  assert.equal(result.task.headSha, "commit-2");
  assert.equal(result.task.diffFingerprint, null);
  assert.equal(result.task.ci, null);
});

test("compare derives reviewed diff fingerprint from Reality", async () => {
  const { controller } = await readyController({
    lifecycle: {
      compare: async () => jsonResponse({
        status: "ahead", aheadBy: 1, behindBy: 0,
        files: [{ path: "src/app.js", status: "modified", additions: 2, deletions: 1, patch: "@@" }],
      }),
    },
  });
  const result = await controller.execute({
    taskId: "task-1",
    action: "compare",
    expectedRevision: 2,
    input: {},
  });
  assert.equal(result.task.state, "DIFF_REVIEWED");
  assert.equal(result.task.diffFingerprint, result.receipt.evidence.diffFingerprint);
  assert.match(result.task.diffFingerprint, /src\/app\.js/);
});

test("successful side effect plus failed save returns reconciliation required", async () => {
  const base = memoryState();
  const { createFactoryController } = await import(controllerUrl + "?split=" + Date.now());
  const lifecycle = {
    inspect: async () => jsonResponse({ repository, defaultBranch: "main", branch: "main", baseSha: "base-1", headSha: "base-1", tree: [] }),
    createBranch: async () => jsonResponse({ branch: "feature-a", headSha: "base-1" }, 201),
    putFile: async () => jsonResponse({ ok: true, commit: "commit-2", sha: "blob-2" }),
  };
  let saves = 0;
  const state = {
    load: () => base.load(),
    async save(input) {
      saves += 1;
      if (saves === 3) throw new Error("storage unavailable");
      return base.save(input);
    },
  };
  const controller = createFactoryController({ lifecycle, state, now: () => "now", createId: () => "r-" + saves });
  await controller.execute({ taskId: "task-1", action: "inspect", expectedRevision: 0, input: { repository, intent: "x", branch: "main" } });
  await controller.execute({ taskId: "task-1", action: "create_branch", expectedRevision: 1, input: { name: "feature-a", fromSha: "base-1" } });
  const result = await controller.execute({
    taskId: "task-1", action: "write", expectedRevision: 2,
    input: { path: "src/app.js", content: "next", expectedSha: "blob-1" },
  });
  assert.equal(result.status, "RECONCILIATION_REQUIRED");
  assert.equal(result.receipt.status, "success");
  assert.equal(result.receipt.identity.headSha, "commit-2");
  assert.equal(result.task, null);
  assert.equal(result.revision, 2);
  assert.equal(result.nextAction, "reconcile");
});
