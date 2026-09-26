import { stampCompletedItem } from "./go-hub-completion-stamp.js";

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function required(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export function sealReadyGate({
  workPackage = null, piece = null, blueprint = null, pieceQc = null,
  evidence = [], knownLimitations = [],
} = {}) {
  if (!workPackage || !piece) throw new Error("Work Package and Piece are required");
  if (String(piece.workPackageId || "") !== String(workPackage.id || "")) {
    throw new Error("Piece must match the Work Package");
  }
  if (!blueprint?.ref || String(workPackage.blueprintRef || "") !== String(blueprint.ref)) {
    throw new Error("Work Package must match the mounted Blueprint");
  }
  if (pieceQc?.status !== "pass") throw new Error("Piece QC pass is required");
  const headSha = required(piece.headSha, "Piece headSha");
  if (String(pieceQc.checkedHeadSha || "") !== headSha) {
    throw new Error("Piece QC checked head must match the Piece head");
  }
  const evidenceIds = Array.isArray(pieceQc.evidenceIds) ? pieceQc.evidenceIds.map(String) : [];
  if (!evidenceIds.length || evidenceIds.some((id) => !evidence.some((item) =>
    String(item?.id || "") === id && item?.scope === "piece" && String(item?.headSha || "") === headSha))) {
    throw new Error("all Piece QC evidence must exist for the exact head");
  }

  const completionStamp = stampCompletedItem({
    name: required(piece.name || piece.id, "Piece name"),
    version: required(workPackage.version, "Work Package version"),
    verified: true,
  });

  return deepFreeze({
    pieceId: required(piece.id, "Piece id"),
    workPackageId: required(workPackage.id, "Work Package id"),
    blueprintRef: String(blueprint.ref),
    inputs: clone(Array.isArray(workPackage.inputs) ? workPackage.inputs : []),
    outputs: clone(Array.isArray(piece.outputs) ? piece.outputs : []),
    dependencies: clone(Array.isArray(workPackage.dependencies) ? workPackage.dependencies : []),
    repository: required(piece.repository, "Piece repository"),
    branch: required(piece.branch, "Piece branch"),
    headSha,
    changedPaths: clone(Array.isArray(piece.changedPaths) ? piece.changedPaths : []),
    pieceQc: clone(pieceQc),
    evidenceIds,
    knownLimitations: clone(Array.isArray(knownLimitations) ? knownLimitations : []),
    assemblyTarget: required(workPackage.assemblyTarget, "assemblyTarget"),
    completionStamp,
    sealedAt: new Date().toISOString(),
    status: "READY_FOR_ASSEMBLY",
  });
}
