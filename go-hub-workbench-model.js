function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function createWorkbenchView(taskSnapshot = {}) {
  return Object.freeze({
    mission: taskSnapshot.mission == null ? null : clone(taskSnapshot.mission),
    blueprint: taskSnapshot.blueprint == null ? null : clone(taskSnapshot.blueprint),
    currentPiece: taskSnapshot.currentPiece == null ? null : clone(taskSnapshot.currentPiece),
    status: String(taskSnapshot.factoryStage || taskSnapshot.state || "UNKNOWN"),
    evidence: Array.isArray(taskSnapshot.evidence) ? clone(taskSnapshot.evidence) : [],
    next: String(taskSnapshot.nextAction || ""),
    blocker: taskSnapshot.blocker == null ? null : String(taskSnapshot.blocker),
  });
}
