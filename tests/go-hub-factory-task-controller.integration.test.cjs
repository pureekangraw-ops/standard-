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

test("one Factory task advances inspect to exact-head CI through Reality receipts", async () => {
  const { createFactoryController } = await import(controllerUrl + "?integration=" + Date.now());
  const lifecycle = {
    inspect: async ({ branch }) => jsonResponse({
      repository, defaultBranch: "main", branch: branch || "main", baseSha: "base-1",
      headSha: branch === "feature-a" ? "commit-2" : "base-1", tree: [],
    }),
    createBranch: async () => jsonResponse({ branch: "feature-a", headSha: "base-1" }, 201),
    putFile: async () => jsonResponse({ ok: true, commit: "commit-2", sha: "blob-2" }),
    compare: async () => jsonResponse({ status: "ahead", aheadBy: 1, behindBy: 0, files: [{ path: "x.js", status: "modified", additions: 1, deletions: 0, patch: "@@" }] }),
    openPullRequest: async () => jsonResponse({ number: 41, state: "open", headBranch: "feature-a", headSha: "commit-2", baseBranch: "main", baseSha: "base-1", mergeable: true }),
    getCI: async () => jsonResponse({ headSha: "commit-2", runs: [{ id: 77, status: "completed", conclusion: "success", headSha: "commit-2" }], checks: [] }),
  };
  const controller = createFactoryController({ lifecycle, state: memoryState(), now: () => "now", createId: () => "r-" + Math.random() });
  let result = await controller.execute({ taskId: "task-1", action: "inspect", expectedRevision: 0, input: { repository, intent: "bridge", branch: "main" } });
  result = await controller.execute({ taskId: "task-1", action: "create_branch", expectedRevision: 1, input: { name: "feature-a", fromSha: "base-1" } });
  result = await controller.execute({ taskId: "task-1", action: "write", expectedRevision: 2, input: { path: "x.js", content: "x", expectedSha: "blob-1" } });
  result = await controller.execute({ taskId: "task-1", action: "compare", expectedRevision: 3, input: {} });
  result = await controller.execute({ taskId: "task-1", action: "open_pr", expectedRevision: 4, input: { title: "Factory bridge", body: "verified" } });
  result = await controller.execute({ taskId: "task-1", action: "check_ci", expectedRevision: 5, input: {} });

  assert.equal(result.task.state, "CI_GREEN");
  assert.equal(result.task.repository, repository);
  assert.equal(result.task.workBranch, "feature-a");
  assert.equal(result.task.headSha, "commit-2");
  assert.equal(result.task.pullRequest.number, 41);
  assert.equal(result.task.ci.headSha, "commit-2");
  assert.equal(result.revision, 6);
});
