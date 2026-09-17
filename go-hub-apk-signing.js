function text(value) { return String(value || "").trim(); }
function number(value) { const n = Number(value); return Number.isSafeInteger(n) ? n : null; }
function blocked(code, extra = {}) { return Object.freeze({ state: "SIGNING_GATE_BLOCKED", code, ...extra }); }
function verifyFailed(code) { return Object.freeze({ state: "SIGNATURE_VERIFY_FAILED", code }); }

export function evaluateApkSigningGate(request = {}, context = {}) {
  const sourceSha = text(request.commitSha);
  const expectedDigest = text(request.unsignedApkSha256);
  const sourceArtifactId = text(request.unsignedArtifactId);
  const profileId = text(request.signingProfileId);
  const build = context.buildArtifact || {};

  if (request.ownerAuthorityState !== "APPROVED") return blocked("OWNER_AUTHORITY_REQUIRED");
  if (!sourceSha || text(context.currentSourceSha) !== sourceSha) return blocked("SOURCE_HEAD_CHANGED");
  if (build.status !== "BUILT" || text(build.kind).toLowerCase() !== "apk") return blocked("APK_BUILD_ARTIFACT_REQUIRED");
  if (text(build.sourceHeadSha) !== sourceSha) return blocked("BUILD_SOURCE_SHA_MISMATCH");
  if (!sourceArtifactId || text(build.id) !== sourceArtifactId) return blocked("BUILD_ARTIFACT_ID_MISMATCH");
  if (!expectedDigest || text(build.digest) !== expectedDigest) return blocked("BUILD_ARTIFACT_DIGEST_MISMATCH");
  if (text(build.applicationId) !== text(request.applicationId) ||
      text(build.versionName) !== text(request.versionName) || number(build.versionCode) !== number(request.versionCode)) {
    return blocked("APK_IDENTITY_MISMATCH");
  }

  const profile = context.profiles?.[profileId];
  if (!profile || profile.available !== true) return blocked("SIGNING_PROFILE_NOT_FOUND", { signingProfileId: profileId });
  const allowedRepositories = Array.isArray(profile.allowedRepositories) ? profile.allowedRepositories.map(String) : [];
  const allowedApplicationIds = Array.isArray(profile.allowedApplicationIds) ? profile.allowedApplicationIds.map(String) : [];
  if (!allowedRepositories.includes(text(request.repository)) || !allowedApplicationIds.includes(text(request.applicationId))) {
    return blocked("SIGNING_PROFILE_NOT_ALLOWED", { signingProfileId: profileId });
  }
  if (!text(profile.expectedCertificateSha256)) return blocked("SIGNING_CERTIFICATE_IDENTITY_REQUIRED", { signingProfileId: profileId });
  if (Array.isArray(context.unresolvedBlockers) && context.unresolvedBlockers.length) {
    return blocked("SIGNING_BLOCKERS_UNRESOLVED", { blockerCount: context.unresolvedBlockers.length });
  }

  return Object.freeze({
    state: "SIGNING_GATE_READY",
    code: "SIGNING_GATE_READY",
    sourceArtifactId,
    unsignedApkSha256: expectedDigest,
    sourceSha,
    applicationId: text(request.applicationId),
    versionName: text(request.versionName),
    versionCode: number(request.versionCode),
    signingProfileId: profileId,
    expectedCertificateSha256: text(profile.expectedCertificateSha256),
  });
}

export function mapSigningWorkflowResult(result = {}) {
  const runId = text(result.runId);
  if (result.ok !== true) {
    return Object.freeze({ state: "SIGNING_FAILED", code: "SIGNING_WORKFLOW_FAILED", runId });
  }
  return Object.freeze({ state: "SIGNING_WORKFLOW_SUCCEEDED", code: "SIGNING_WORKFLOW_SUCCEEDED", runId });
}

export function verifySignedApkResult(request = {}, profile = {}, result = {}) {
  if (result.exists !== true) return verifyFailed("SIGNED_APK_NOT_FOUND");
  if (result.signatureValid !== true) return verifyFailed("APK_SIGNATURE_INVALID");
  const signedDigest = text(result.sha256);
  if (!signedDigest) return verifyFailed("SIGNED_APK_DIGEST_REQUIRED");
  if (text(result.applicationId) !== text(request.applicationId) ||
      text(result.versionName) !== text(request.versionName) || number(result.versionCode) !== number(request.versionCode)) {
    return verifyFailed("SIGNED_APK_IDENTITY_MISMATCH");
  }
  const expectedCertificate = text(profile.expectedCertificateSha256);
  if (!expectedCertificate || text(result.certificateSha256) !== expectedCertificate) {
    return verifyFailed("APK_CERTIFICATE_MISMATCH");
  }
  const workflowRunId = text(result.workflowRunId);
  const verifiedAt = text(result.verifiedAt);
  const artifactId = text(result.id);
  const location = text(result.location);
  if (!workflowRunId || !verifiedAt || !artifactId || !location) return verifyFailed("SIGNED_APK_EVIDENCE_INCOMPLETE");

  const evidence = Object.freeze({
    sourceSha: text(request.commitSha),
    unsignedApkSha256: text(request.unsignedApkSha256),
    signedApkSha256: signedDigest,
    certificateSha256: expectedCertificate,
    signingWorkflowRunId: workflowRunId,
    signingProfileId: text(request.signingProfileId),
    verificationResult: "pass",
    verifiedAt,
  });
  const artifact = Object.freeze({
    id: artifactId,
    kind: "apk",
    sourceArtifactId: text(request.unsignedArtifactId),
    sourceHeadSha: text(request.commitSha),
    digest: signedDigest,
    location,
    applicationId: text(request.applicationId),
    versionName: text(request.versionName),
    versionCode: number(request.versionCode),
    certificateSha256: expectedCertificate,
    signingProfileId: text(request.signingProfileId),
    workflowRunId,
    verifiedAt,
    status: "SIGNATURE_VERIFIED",
  });
  return Object.freeze({ state: "SIGNATURE_VERIFIED", code: "SIGNATURE_VERIFIED", evidence, artifact });
}
