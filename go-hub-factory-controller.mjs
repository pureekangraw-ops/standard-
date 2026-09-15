import { createCodeTask, createCodeTaskFromSnapshot } from "./go-hub-code-task.js";
import { createRealityReceipt } from "./go-hub-reality-receipt.mjs";

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

function auditEvent({ action, receipt, before, after, at }) {
  return {
    event: "FACTORY_ACTION",
    action,
    receiptId: receipt.id,
    from: before?.state || null,
    to: after?.state || null,
    status: receipt.status,
    headSha: receipt.identity?.headSha || null,
    pullRequestNumber: receipt.identity?.pullRequestNumber || null,
    runId: receipt.identity?.runId || null,
    at,
  };
}

export function createFactoryController({ lifecycle, state, now = () => new Date().toISOString(), createId = () => crypto.randomUUID() } = {}) {
  if (!lifecycle || !state) throw new Error("lifecycle and state are required");

  async function loadCurrent(expectedRevision) {
    const stored = await state.load();
    const revision = stored?.revision ?? 0;
    if (expectedRevision != null && Number(expectedRevision) !== revision) throw new Error("STALE_TASK_REVISION");
    return { stored, revision };
  }

  async function save({ revision, task, receipt, action, before }) {
    const saved = await state.save({
      expectedRevision: revision,
      task: task.snapshot(),
      receipt,
      auditEvent: auditEvent({ action, receipt, before, after: task.snapshot(), at: now() }),
    });
    return {
      status: receipt.status === "success" ? "OK" : "ACTION_FAILED",
      receipt,
      task: saved.task,
      revision: saved.revision,
      nextAction: saved.task.nextAction,
    };
  }

  return Object.freeze({
    async execute({ taskId, action, input = {}, expectedRevision } = {}) {
      const id = String(taskId || "").trim();
      if (!id) throw new Error("taskId is required");
      const current = await loadCurrent(expectedRevision);

      if (action === "inspect") {
        if (current.stored) throw new Error("inspect requires a new task");
        const repository = String(input.repository || "").trim();
        const intent = String(input.intent || "").trim();
        if (!repository) throw new Error("repository is required");
        if (!intent) throw new Error("intent is required");
        const response = await lifecycle.inspect({ repository, ...(input.branch ? { branch: input.branch } : {}) });
        const parsed = await parseResponse(response);
        const receipt = createRealityReceipt({
          id: createId(), action, status: parsed.ok ? "success" : "failure", repository,
          observedAt: now(), source: "github",
          identity: parsed.ok ? {
            baseBranch: parsed.payload.defaultBranch,
            baseSha: parsed.payload.baseSha,
            workBranch: parsed.payload.branch === parsed.payload.defaultBranch ? null : parsed.payload.branch,
            headSha: parsed.payload.headSha,
          } : {},
          result: parsed.payload,
          evidence: parsed.ok ? { treeCount: Array.isArray(parsed.payload.tree) ? parsed.payload.tree.length : 0 } : { upstreamStatus: parsed.status },
        });
        if (!parsed.ok) return { status: "ACTION_FAILED", receipt, task: null, revision: 0, nextAction: "inspect" };
        let task = createCodeTask({ id, intent, repository });
        task = task.transition("INSPECTING", {
          baseBranch: parsed.payload.defaultBranch,
          baseSha: parsed.payload.baseSha,
          workBranch: parsed.payload.branch === parsed.payload.defaultBranch ? null : parsed.payload.branch,
          headSha: parsed.payload.headSha,
        });
        return save({ revision: current.revision, task, receipt, action, before: null });
      }

      if (action === "create_branch") {
        if (!current.stored?.task) throw new Error("existing task is required");
        const before = current.stored.task;
        const task = createCodeTaskFromSnapshot(before);
        const name = String(input.name || "").trim();
        const fromSha = String(input.fromSha || "").trim();
        if (!name || !fromSha) throw new Error("branch name and fromSha are required");
        if (fromSha !== before.baseSha) throw new Error("IDENTITY_MISMATCH");
        const response = await lifecycle.createBranch({ repository: before.repository, name, fromSha });
        const parsed = await parseResponse(response);
        const receipt = createRealityReceipt({
          id: createId(), action, status: parsed.ok ? "success" : "failure", repository: before.repository,
          observedAt: now(), source: "github",
          identity: parsed.ok ? { baseBranch: before.baseBranch, baseSha: before.baseSha, workBranch: parsed.payload.branch, headSha: parsed.payload.headSha } : { baseBranch: before.baseBranch, baseSha: before.baseSha },
          result: parsed.payload,
          evidence: parsed.ok ? { created: true } : { upstreamStatus: parsed.status },
        });
        if (!parsed.ok) {
          return save({ revision: current.revision, task, receipt, action, before });
        }
        if (parsed.payload.branch !== name || parsed.payload.headSha !== fromSha) throw new Error("IDENTITY_MISMATCH");
        const next = task.transition("BRANCH_READY", {
          baseBranch: before.baseBranch,
          baseSha: before.baseSha,
          workBranch: name,
          headSha: parsed.payload.headSha,
        });
        return save({ revision: current.revision, task: next, receipt, action, before });
      }

      throw new Error(`unsupported Factory action: ${action}`);
    },
  });
}
