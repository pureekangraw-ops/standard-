import { createCodeTask, createCodeTaskFromSnapshot } from "./go-hub-code-task.js";

function hasMethod(target, name) {
  return Boolean(target && typeof target[name] === "function");
}

function taskSnapshot(task) {
  if (!task) return null;
  if (typeof task.snapshot === "function") return task.snapshot();
  return structuredClone(task);
}

export function createCodeCapability({ workspace = null, task = null } = {}) {
  const canList = hasMethod(workspace, "listFiles");
  const canRead = canList && hasMethod(workspace, "readText");
  const canInspect = canRead && hasMethod(workspace, "inspect") && hasMethod(workspace, "listTree");
  const canWrite = canRead && hasMethod(workspace, "writeText");
  const canDelete = canWrite && hasMethod(workspace, "deletePath");
  const canBranch = canWrite && hasMethod(workspace, "createBranch");
  const canDiff = canBranch && hasMethod(workspace, "compare");
  const canPullRequest = canDiff && hasMethod(workspace, "openPullRequest") && hasMethod(workspace, "getPullRequest");
  const canCI = canPullRequest && hasMethod(workspace, "getCI") && hasMethod(workspace, "rerunFailed");
  const canMerge = canCI && hasMethod(workspace, "mergePullRequest");
  const canObserveDeploy = canMerge && hasMethod(workspace, "getWorkflowRuns");
  const fullLifecycleReady = canInspect && canDelete && canObserveDeploy;
  const snapshot = taskSnapshot(task);

  return Object.freeze({
    id: "code",
    title: "Code",
    description: "Repository-backed coding workspace",
    status: fullLifecycleReady ? "ready" : canDiff ? "partial-lifecycle" : canRead ? "read-only" : "needs-workspace",
    canRead,
    canInspect,
    canWrite,
    canDelete,
    canBranch,
    canDiff,
    canPullRequest,
    canCI,
    canMerge,
    canObserveDeploy,
    workspace,
    task: snapshot,
    nextAction: snapshot?.nextAction || null,
    blocker: snapshot?.blocker || null,
    repository: snapshot?.repository || workspace?.repository || null,
    baseBranch: snapshot?.baseBranch || null,
    baseSha: snapshot?.baseSha || null,
    workBranch: snapshot?.workBranch || null,
    headSha: snapshot?.headSha || null,
    pullRequest: snapshot?.pullRequest || null,
    ci: snapshot?.ci || null,
    deploy: snapshot?.deployment || null,
    verification: snapshot?.verification || null,
  });
}


export function createCodeTaskSession({ persistence, initial = {} } = {}) {
  if (!persistence || typeof persistence.loadState !== "function" ||
      typeof persistence.commitState !== "function") {
    throw new TypeError("task persistence port is required");
  }
  return Object.freeze({
    async load() {
      const stored = await persistence.loadState();
      return stored ? createCodeTaskFromSnapshot(stored) : createCodeTask(initial);
    },
    async save(task) {
      const proposed = typeof task?.snapshot === "function" ? task.snapshot() : structuredClone(task);
      return persistence.commitState({
        proposed,
        command: { type: "SAVE_CODE_TASK" },
      });
    },
  });
}
