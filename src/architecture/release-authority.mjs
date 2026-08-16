export const NORMALPOCKET_RELEASE = Object.freeze({
  product: "NormalPocket",
  version: "1.3.1",
  releaseId: "v1.3.1-structural-hardening"
});

export function restampPackage(pack, checksum) {
  if (!pack || typeof pack !== "object") return pack;
  const next = { ...pack, app: NORMALPOCKET_RELEASE.product, appVersion: NORMALPOCKET_RELEASE.version };
  if (typeof checksum === "function") {
    delete next.checksum;
    next.checksum = checksum(next);
  }
  return next;
}

export function restampAudit(report) {
  if (!report || typeof report !== "object") return report;
  return { ...report, app: NORMALPOCKET_RELEASE.product, appVersion: NORMALPOCKET_RELEASE.version };
}
