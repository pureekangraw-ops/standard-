import { sealReadyGate } from "./go-hub-ready-gate.js";

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function required(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function successfulCiForHead(ci, headSha) {
  if (!ci || String(ci.headSha || "") !== headSha) return false;
  if (ci.status === "success" || ci.conclusion === "success") return true;
  const signals = [...(Array.isArray(ci.runs) ? ci.runs : []), ...(Array.isArray(ci.checks) ? ci.checks : [])];
  return signals.length > 0 && signals.every(item => item?.status === "completed" && item?.conclusion === "success" && (!item?.headSha || String(item.headSha) === headSha));
}

/**
 * Produce the governed handoff consumed by the Assembly lane.
 *
 * CI is corroborating exact-head evidence only. It never substitutes for
 * Piece QC and cannot mint a Ready Gate by itself.
 */
export function produceReadyGate({
  workPackage = null,
  piece = null,
  blueprint = null,
  pieceQc = null,
  evidence = [],
  ci = null,
  knownLimitations = [],
} = {}) {
  const headSha = required(piece?.headSha, "Piece headSha");
  if (ci && !successfulCiForHead(ci, headSha)) {
    throw new Error("Ready Gate CI evidence must be successful for the exact Piece head");
  }

  const readyGate = sealReadyGate({
    workPackage,
    piece,
    blueprint,
    pieceQc,
    evidence,
    knownLimitations,
  });

  return Object.freeze({
    readyGate,
    piece: clone(piece),
    ci: ci ? Object.freeze({
      status: "success",
      headSha,
      corroboratingOnly: true,
    }) : null,
    nextAction: "request-assembly-slot",
  });
}
