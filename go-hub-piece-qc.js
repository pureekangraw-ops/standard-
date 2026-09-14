const REQUIRED_CLAIMS = Object.freeze([
  ["purpose", "purpose-correct"],
  ["behavior", "behavior-correct"],
  ["interface", "interface-correct"],
]);

export function evaluatePieceQc({ workPackage = null, piece = null, blueprint = null, evidence = [] } = {}) {
  const checkedHeadSha = piece?.headSha == null ? null : String(piece.headSha);
  const contextMatches = Boolean(
    workPackage?.id && piece?.id && blueprint?.ref && checkedHeadSha &&
    String(piece.workPackageId || "") === String(workPackage.id) &&
    String(workPackage.blueprintRef || "") === String(blueprint.ref),
  );
  const candidates = contextMatches && Array.isArray(evidence)
    ? evidence.filter((item) => item?.scope === "piece" && String(item.headSha || "") === checkedHeadSha)
    : [];
  const used = REQUIRED_CLAIMS.map(([, claim]) => candidates.find((item) => item?.claim === claim)).filter(Boolean);
  const checks = {
    purpose: contextMatches && Boolean(used.find((item) => item.claim === "purpose-correct")),
    behavior: contextMatches && Boolean(used.find((item) => item.claim === "behavior-correct")),
    interface: contextMatches && Boolean(used.find((item) => item.claim === "interface-correct")),
    evidence: contextMatches && used.length === REQUIRED_CLAIMS.length,
  };
  return Object.freeze({
    status: Object.values(checks).every(Boolean) ? "pass" : "fail",
    checkedHeadSha,
    checks: Object.freeze(checks),
    evidenceIds: Object.freeze(used.map((item) => String(item.id))),
    checkedAt: new Date().toISOString(),
  });
}
