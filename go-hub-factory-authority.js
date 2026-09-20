import {
  FLOW_STATES,
  PROCESS_TYPES,
  PLAN_FIELDS,
  createWorkPackage,
  receivePackage,
  routeCentre,
  findRepository,
  lockPlan,
  executePlan,
  verifyPlan,
  deliverPackage,
  sendPackage,
  readOnly,
  bigDirect,
} from "./go-hub-lean-flow.js";

const PRODUCTION_NEXT = Object.freeze({
  INSPECT_REALITY: "inspect-reality",
  BASELINE: "capture-baseline",
  TRACE: "trace-system",
  PLAN: "plan-change",
  WRITE: "write",
  LOCAL_VERIFY: "local-verify",
  PIECE_READY: "piece-qc",
});

export function deriveFactoryNextAction(snapshot = {}) {
  const stage = String(snapshot.factoryStage || "").trim();
  if (!stage) return null;
  switch (stage) {
    case "PRODUCTION": {
      const phase = String(snapshot.productionPhase || "INSPECT_REALITY");
      const next = PRODUCTION_NEXT[phase];
      if (!next) throw new Error(`unsupported production phase: ${phase}`);
      return next;
    }
    case "PIECE_QC": return snapshot.pieceQc?.status === "pass" ? "ready-gate" : "fix-piece";
    case "READY_GATE": return "assemble";
    case "ASSEMBLY": return "assembly-qc";
    case "ASSEMBLY_QC": return snapshot.assemblyQc?.status === "pass" ? "merge-gate" : "fix-assembly";
    case "MERGE_GATE": return "build";
    case "BUILD": return String(snapshot.buildArtifact?.kind || "").toLowerCase() === "apk" ? "signing-gate" : "product-qc";
    case "SIGNING_GATE": return "sign-apk";
    case "SIGNATURE_VERIFIED": return "product-qc";
    case "PRODUCT_QC": return "fix-product";
    case "PRODUCT_VERIFIED": return "publish";
    case "PUBLISHED": return "observe";
    case "OBSERVED": return "verify-chain";
    case "VERIFIED_CHAIN": return "closeout";
    case "RECOVERY_REQUIRED": return "repair-first-broken-truth";
    case "CLOSED": return "learn";
    case "LEARNED": return "complete";
    default: throw new Error(`unsupported factory stage: ${stage}`);
  }
}

export function resolveEffectiveTaskAuthority(snapshot = {}) {
  const factoryNext = deriveFactoryNextAction(snapshot);
  if (factoryNext) return Object.freeze({ source: "factory", status: String(snapshot.factoryStage), nextAction: factoryNext });
  return Object.freeze({ source: "lifecycle", status: String(snapshot.state || "UNKNOWN"), nextAction: String(snapshot.nextAction || "") });
}

export {
  FLOW_STATES, PROCESS_TYPES, PLAN_FIELDS, createWorkPackage, receivePackage,
  routeCentre, findRepository, lockPlan, executePlan, verifyPlan,
  deliverPackage, sendPackage, readOnly, bigDirect,
};
