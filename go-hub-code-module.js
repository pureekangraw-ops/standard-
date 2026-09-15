import { createCodeTask, createCodeTaskFromSnapshot } from "./go-hub-code-task.js";

function hasMethod(target, name) {
  return Boolean(target && typeof target[name] === "function");
}

function taskSnapshot(task) {
  if (!task) return null;
  if (typeof task.snapshot === "function") return task.snapshot();
  return structuredClone(task);
}

function contextSnapshot(workContext) {
  return workContext == null ? null : structuredClone(workContext);
}

export function createCodeCapability({ workspace = null, task = null, workContext = null } = {}) {
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
    workContext: contextSnapshot(workContext),
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
    factoryStage: snapshot?.factoryStage || null,
    workPackage: snapshot?.workPackage || null,
    piece: snapshot?.piece || null,
    pieceQc: snapshot?.pieceQc || null,
    gateHandoff: snapshot?.gateHandoff || null,
    assembly: snapshot?.assembly || null,
    assemblyQc: snapshot?.assemblyQc || null,
    buildArtifact: snapshot?.buildArtifact || null,
    productQc: snapshot?.productQc || null,
    verificationScan: snapshot?.verificationScan || null,
    closeout: snapshot?.closeout || null,
    lessons: Array.isArray(snapshot?.lessons) ? snapshot.lessons : [],
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
