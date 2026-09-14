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
  const canWrite = canRead && hasMethod(workspace, "writeText");
  const canBranch = canWrite && hasMethod(workspace, "createBranch");
  const canDiff = canBranch && hasMethod(workspace, "compare");
  const snapshot = taskSnapshot(task);

  return Object.freeze({
    id: "code",
    title: "Code",
    description: "Repository-backed coding workspace",
    status: canDiff ? "ready" : canRead ? "read-only" : "needs-workspace",
    canRead,
    canWrite,
    canBranch,
    canDiff,
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
    deploy: snapshot?.deploy || null,
    verification: snapshot?.verification || null,
  });
}
