import { resolveEffectiveTaskAuthority } from "./go-hub-factory-authority.js";

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function createWorkbenchView(taskSnapshot = {}) {
  const authority = resolveEffectiveTaskAuthority(taskSnapshot);
  return Object.freeze({
    mission: taskSnapshot.mission == null ? null : clone(taskSnapshot.mission),
    blueprint: taskSnapshot.blueprint == null ? null : clone(taskSnapshot.blueprint),
    currentPiece: taskSnapshot.currentPiece == null ? null : clone(taskSnapshot.currentPiece),
    status: authority.status,
    evidence: Array.isArray(taskSnapshot.evidence) ? clone(taskSnapshot.evidence) : [],
    next: authority.nextAction,
    blocker: taskSnapshot.blocker == null ? null : String(taskSnapshot.blocker),
  });
}
