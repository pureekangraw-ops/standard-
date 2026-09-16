const test = require("node:test");
const assert = require("node:assert/strict");

const SOURCE_SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const UNSIGNED_DIGEST = "1".repeat(64);
const SIGNED_DIGEST = "2".repeat(64);
const CERT = "3".repeat(64);
const SECRET_MARKERS = ["raw-keystore-material", "store-password", "key-password"];

async function subject() {
  return import("../go-hub-apk-signing.js");
}

function request(overrides = {}) {
  return {
    repository: "pureekangraw-ops/ygph-metropolis",
    commitSha: SOURCE_SHA,
    sourceRef: "main",
    applicationId: "com.yggdrasil.lighthouse",
    versionName: "1.0.0-owner.1",
    versionCode: 1006,
    unsignedArtifactRef: "artifact://unsigned.apk",
    unsignedApkSha256: UNSIGNED_DIGEST,
    signingProfileId: "lighthouse-production",
    workPackageId: "wp-apk-1",
    requester: "GO",
    ownerAuthorityState: "APPROVED",
    ...overrides,
  };
}

function gateContext(overrides = {}) {
  return {
    currentSourceSha: SOURCE_SHA,
    buildEvidence: {
      status: "success",
      sourceSha: SOURCE_SHA,
      artifactSha256: UNSIGNED_DIGEST,
      assemblyQcStatus: "pass",
    },
    artifact: {
      exists: true,
      readable: true,
      sha256: UNSIGNED_DIGEST,
      applicationId: "com.yggdrasil.lighthouse",
      versionName: "1.0.0-owner.1",
      versionCode: 1006,
    },
    profiles: {
      "lighthouse-production": {
        available: true,
        allowedRepositories: ["pureekangraw-ops/ygph-metropolis"],
        allowedApplicationIds: ["com.yggdrasil.lighthouse"],
        expectedCertificateSha256: CERT,
      },
    },
    unresolvedBlockers: [],
    ...overrides,
  };
}

test("blocks unsigned APK whose digest differs from Build evidence", async () => {
  const { evaluateApkSigningGate } = await subject();
  const result = evaluateApkSigningGate(request(), gateContext({
    artifact: { ...gateContext().artifact, sha256: "9".repeat(64) },
  }));
  assert.equal(result.state, "SIGNING_GATE_BLOCKED");
  assert.equal(result.code, "BUILD_ARTIFACT_DIGEST_MISMATCH");
});

test("blocks APK whose application ID differs from request", async () => {
  const { evaluateApkSigningGate } = await subject();
  const result = evaluateApkSigningGate(request(), gateContext({
    artifact: { ...gateContext().artifact, applicationId: "com.example.wrong" },
  }));
  assert.equal(result.state, "SIGNING_GATE_BLOCKED");
  assert.equal(result.code, "APK_IDENTITY_MISMATCH");
});

test("blocks a missing signing profile without fallback", async () => {
  const { evaluateApkSigningGate } = await subject();
  const result = evaluateApkSigningGate(request({ signingProfileId: "missing" }), gateContext());
  assert.equal(result.state, "SIGNING_GATE_BLOCKED");
  assert.equal(result.code, "SIGNING_PROFILE_NOT_FOUND");
  assert.equal(result.signingProfileId, "missing");
});

test("blocks a profile not authorized for repository or application ID", async () => {
  const { evaluateApkSigningGate } = await subject();
  const result = evaluateApkSigningGate(request(), gateContext({
    profiles: {
      "lighthouse-production": {
        ...gateContext().profiles["lighthouse-production"],
        allowedRepositories: ["owner/other"],
      },
    },
  }));
  assert.equal(result.state, "SIGNING_GATE_BLOCKED");
  assert.equal(result.code, "SIGNING_PROFILE_NOT_ALLOWED");
});

test("invalidates evidence when current source SHA changes", async () => {
  const { evaluateApkSigningGate } = await subject();
  const result = evaluateApkSigningGate(request(), gateContext({ currentSourceSha: OTHER_SHA }));
  assert.equal(result.state, "SIGNING_GATE_BLOCKED");
  assert.equal(result.code, "SOURCE_HEAD_CHANGED");
});

test("maps authorized workflow failure to explicit signing failure", async () => {
  const { mapSigningWorkflowResult } = await subject();
  const result = mapSigningWorkflowResult({
    ok: false,
    runId: "run-42",
    code: "CI_JOB_FAILED",
  });
  assert.equal(result.state, "SIGNING_FAILED");
  assert.equal(result.code, "SIGNING_WORKFLOW_FAILED");
  assert.equal(result.runId, "run-42");
});

test("fails signature verification for an invalid signed artifact", async () => {
  const { verifySignedApkResult } = await subject();
  const result = verifySignedApkResult(request(), gateContext().profiles["lighthouse-production"], {
    exists: true,
    sha256: SIGNED_DIGEST,
    applicationId: "com.yggdrasil.lighthouse",
    versionName: "1.0.0-owner.1",
    versionCode: 1006,
    certificateSha256: CERT,
    signatureValid: false,
    workflowRunId: "run-42",
  });
  assert.equal(result.state, "SIGNATURE_VERIFY_FAILED");
  assert.equal(result.code, "APK_SIGNATURE_INVALID");
});

test("accepts a valid signed APK and binds the full evidence chain", async () => {
  const { verifySignedApkResult } = await subject();
  const result = verifySignedApkResult(request(), gateContext().profiles["lighthouse-production"], {
    exists: true,
    sha256: SIGNED_DIGEST,
    applicationId: "com.yggdrasil.lighthouse",
    versionName: "1.0.0-owner.1",
    versionCode: 1006,
    certificateSha256: CERT,
    signatureValid: true,
    workflowRunId: "run-42",
    verifiedAt: "2026-09-16T00:00:00.000Z",
  });
  assert.equal(result.state, "SIGNATURE_VERIFIED");
  assert.deepEqual(result.evidence, {
    sourceSha: SOURCE_SHA,
    unsignedApkSha256: UNSIGNED_DIGEST,
    signedApkSha256: SIGNED_DIGEST,
    certificateSha256: CERT,
    signingWorkflowRunId: "run-42",
    signingProfileId: "lighthouse-production",
    verificationResult: "pass",
    verifiedAt: "2026-09-16T00:00:00.000Z",
  });
});

test("never returns or persists signing secret material", async () => {
  const { evaluateApkSigningGate, mapSigningWorkflowResult, verifySignedApkResult } = await subject();
  const hostile = {
    ...request(),
    rawKeystore: SECRET_MARKERS[0],
    signingPassword: SECRET_MARKERS[1],
    keyPassword: SECRET_MARKERS[2],
  };
  const values = [
    evaluateApkSigningGate(hostile, gateContext()),
    mapSigningWorkflowResult({ ok: false, runId: "run-42", stderr: SECRET_MARKERS.join(":") }),
    verifySignedApkResult(hostile, gateContext().profiles["lighthouse-production"], {
      exists: true,
      sha256: SIGNED_DIGEST,
      applicationId: hostile.applicationId,
      versionName: hostile.versionName,
      versionCode: hostile.versionCode,
      certificateSha256: CERT,
      signatureValid: true,
      workflowRunId: "run-42",
      verifiedAt: "2026-09-16T00:00:00.000Z",
    }),
  ];
  const serialized = JSON.stringify(values);
  for (const secret of SECRET_MARKERS) assert.equal(serialized.includes(secret), false);
});
