import { assertCompletionStamp } from "./go-hub-completion-stamp.js";

function required(value, label) { const text = String(value || "").trim(); if (!text) throw new Error(`${label} is required`); return text; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

export function assembleReadyPieces({ id, blueprint, handoffs = [], repository, integrationBranch, integrationHeadSha } = {}) {
  if (!blueprint?.ref) throw new Error("mounted Blueprint is required");
  if (!Array.isArray(handoffs) || handoffs.length === 0) throw new Error("Ready Gate handoffs are required");
  if (handoffs.some(item => item?.status !== "READY_FOR_ASSEMBLY")) throw new Error("every handoff must be READY_FOR_ASSEMBLY");
  if (handoffs.some(item => item.blueprintRef !== blueprint.ref)) throw new Error("handoff Blueprint does not match mounted Blueprint");
  if (handoffs.some(item => !String(item.headSha || "").trim())) throw new Error("every handoff requires an exact head");

  for (const handoff of handoffs) assertCompletionStamp(handoff?.completionStamp);
  const versions = handoffs.map(item => item.completionStamp.version);
  const version = versions[0];
  if (versions.some(item => item !== version)) throw new Error("completion stamp version mismatch");
  if (blueprint.version != null && required(blueprint.version, "Blueprint version") !== version) {
    throw new Error("completion stamp version does not match mounted Blueprint");
  }

  const pieceIds = handoffs.map(item => required(item.pieceId, "piece id"));
  if (new Set(pieceIds).size !== pieceIds.length) throw new Error("duplicate Piece handoff");
  const result = {
    id: required(id, "assembly id"), blueprintRef: String(blueprint.ref), pieceIds,
    version,
    completionStamps: clone(handoffs.map(item => item.completionStamp)),
    sourceHeads: handoffs.map(item => String(item.headSha)), repository: required(repository, "repository"),
    integrationBranch: required(integrationBranch, "integrationBranch"), integrationHeadSha: required(integrationHeadSha, "integrationHeadSha"),
    inputs: clone(handoffs.flatMap(item => item.inputs || [])), outputs: clone(handoffs.flatMap(item => item.outputs || [])),
    dependencies: clone([...new Set(handoffs.flatMap(item => item.dependencies || []))]), status: "ASSEMBLED", assembledAt: new Date().toISOString(),
  };
  return Object.freeze(result);
}
