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
      saved = { revision: current + 1, task: structuredClone(task), receipts: [...(saved?.receipts || []), structuredClone(receipt)], audit: [...(saved?.audit || []), structuredClone(auditEvent)] };
      return { revision: saved.revision, task: structuredClone(task), receipt: structuredClone(receipt) };
    },
  };
}

test("inspect resumes an existing Factory task from GitHub reality instead of rejecting it", async () => {
  const { createFactoryController } = await import(controllerUrl + "?resume=" + Date.now());
  const state = memoryState();
  const lifecycle = {
    inspect: async ({ branch }) => jsonResponse({
      repository,
      defaultBranch: "main",
      branch: branch || "main",
      baseSha: "base-1",
      headSha: branch === "feature-a" ? "head-2" : "base-1",
      tree: [],
    }),
    createBranch: async () => jsonResponse({ branch: "feature-a", headSha: "base-1" }, 201),
  };
  const controller = createFactoryController({ lifecycle, state, now: () => "now", createId: () => "r-" + Math.random() });
  await controller.execute({ taskId: "task-1", action: "inspect", expectedRevision: 0, input: { repository, intent: "bridge", branch: "main" } });
  await controller.execute({ taskId: "task-1", action: "create_branch", expectedRevision: 1, input: { name: "feature-a", fromSha: "base-1" } });

  const resumed = await controller.execute({
    taskId: "task-1", action: "inspect", expectedRevision: 2,
    input: { repository, intent: "ignored-on-resume" },
  });
  assert.equal(resumed.status, "OK");
  assert.equal(resumed.task.workBranch, "feature-a");
  assert.equal(resumed.task.headSha, "head-2");
  assert.equal(resumed.task.diffFingerprint, null);
  assert.equal(resumed.task.ci, null);
  assert.equal(resumed.revision, 3);
});
