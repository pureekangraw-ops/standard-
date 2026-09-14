function hasMethod(target, name) {
  return Boolean(target && typeof target[name] === "function");
}

export function createCodeCapability({ workspace = null } = {}) {
  const canList = hasMethod(workspace, "listFiles");
  const canRead = canList && hasMethod(workspace, "readText");
  const canWrite = canRead && hasMethod(workspace, "writeText");

  return Object.freeze({
    id: "code",
    title: "Code",
    description: "Repository-backed coding workspace",
    status: canWrite ? "ready" : canRead ? "read-only" : "needs-workspace",
    canRead,
    canWrite,
    workspace,
  });
}
