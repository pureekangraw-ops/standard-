export function deriveFactoryNextAction(snapshot = {}) {
  const stage = String(snapshot.factoryStage || "").trim();
  if (!stage) return null;

  switch (stage) {
    case "PRODUCTION":
      return snapshot.piece ? "piece-qc" : "record-piece";
    case "PIECE_QC":
      return snapshot.pieceQc?.status === "pass" ? "ready-gate" : "fix-piece";
    case "READY_GATE":
      return "assemble";
    case "ASSEMBLY":
      return "assembly-qc";
    case "ASSEMBLY_QC":
      return snapshot.assemblyQc?.status === "pass" ? "build" : "fix-assembly";
    case "BUILD":
      return "product-qc";
    case "PRODUCT_QC":
      return "fix-product";
    case "PRODUCT_VERIFIED":
      return "verify-chain";
    case "VERIFIED_CHAIN":
      return "closeout";
    case "RECOVERY_REQUIRED":
      return "repair-first-broken-truth";
    case "CLOSED":
      return "learn";
    case "LEARNED":
      return "complete";
    default:
      throw new Error(`unsupported factory stage: ${stage}`);
  }
}

export function resolveEffectiveTaskAuthority(snapshot = {}) {
  const factoryNext = deriveFactoryNextAction(snapshot);
  if (factoryNext) {
    return Object.freeze({
      source: "factory",
      status: String(snapshot.factoryStage),
      nextAction: factoryNext,
    });
  }
  return Object.freeze({
    source: "lifecycle",
    status: String(snapshot.state || "UNKNOWN"),
    nextAction: String(snapshot.nextAction || ""),
  });
}
