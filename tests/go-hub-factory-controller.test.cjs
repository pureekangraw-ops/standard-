"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const controllerUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-factory-controller.mjs")).href;
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
