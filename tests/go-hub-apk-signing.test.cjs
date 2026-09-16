"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const signingUrl = pathToFileURL(path.join(root, "go-hub-apk-signing.js")).href;
const taskUrl = pathToFileURL(path.join(root, "go-hub-code-task.js")).href;

const SOURCE_SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const UNSIGNED_DIGEST = "1".repeat(64);
const SIGNED_DIGEST = "2".repeat(64);
const CERT = "3".repeat(64);
const SECRET_MARKERS = ["raw-keystore-material", "store-password", "key-password"];

function request(overrides = {}) {
  return {
    repository: "pureekangraw-ops/ygph-metropolis",
    commitSha: SOURCE_SHA,
    sourceRef: "main",
    applicationId: "com.yggdrasil.lighthouse",
    versionName: "1.0.0-owner.1",
    versionCode: 1006,
    unsignedArtifactId: "unsigned-apk",
    unsignedArtifactRef: "artifact://unsigned.apk",
    unsignedApkSha256: UNSIGNED_DIGEST,
    signingProfileId: "lighthouse-production",
    requester: "GO",
    ownerAuthorityState: "APPROVED",
    ...overrides,
  };
}

function buildArtifact(overrides = {}) {
  return {
    id: "unsigned-apk",
    kind: "apk",
    assemblyId: "assembly-1",
    assemblyHeadSha: "assembly-head",
    sourceHeadSha: SOURCE_SHA,
    blueprintRef: "spec.md",
    digest: UNSIGNED_DIGEST,
    location: "artifact://unsigned.apk",
    builtAt: "now",
    status: "BUILT",
    applicationId: "com.yggdrasil.lighthouse",
    versionName: "1.0.0-owner.1",
    versionCode: 1006,
    ...overrides,
  };
}

function gateContext(overrides = {}) {
  return {
    currentSourceSha: SOURCE_SHA,
    buildArtifact: buildArtifact(),
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

async function signing() { return import(`${signingUrl}?signing=${Date.now()}-${Math.random()}`); }
async function taskModule() { return import(`${taskUrl}?signing-task=${Date.now()}-${Math.random()}`); }

test("Signing Gate accepts only exact Build APK source digest identity and authorized profile", async () => {
  const { evaluateApkSigningGate } = await signing();
  const ready = evaluateApkSigningGate(request(), gateContext());
  assert.equal(ready.state, "SIGNING_GATE_READY");
  assert.equal(ready.sourceArtifactId, "unsigned-apk");
  assert.equal(ready.unsignedApkSha256, UNSIGNED_DIGEST);
  assert.equal(ready.sourceSha, SOURCE_SHA);
  assert.equal(ready.signingProfileId, "lighthouse-production");

  const digestMismatch = evaluateApkSigningGate(request(), gateContext({ buildArtifact: buildArtifact({ digest: "9".repeat(64) }) }));
  assert.equal(digestMismatch.state, "SIGNING_GATE_BLOCKED");
  assert.equal(digestMismatch.code, "BUILD_ARTIFACT_DIGEST_MISMATCH");
  assert.equal(evaluateApkSigningGate(request(), gateContext({ buildArtifact: buildArtifact({ applicationId: "com.example.wrong" }) })).code, "APK_IDENTITY_MISMATCH");
  assert.equal(evaluateApkSigningGate(request({ signingProfileId: "missing" }), gateContext()).code, "SIGNING_PROFILE_NOT_FOUND");
  assert.equal(evaluateApkSigningGate(request(), gateContext({ currentSourceSha: OTHER_SHA })).code, "SOURCE_HEAD_CHANGED");
});

test("authorized signing workflow failure becomes explicit and secret-free", async () => {
  const { mapSigningWorkflowResult } = await signing();
  const result = mapSigningWorkflowResult({ ok: false, runId: "run-42", code: "CI_JOB_FAILED", stderr: SECRET_MARKERS.join(":") });
  assert.deepEqual(result, { state: "SIGNING_FAILED", code: "SIGNING_WORKFLOW_FAILED", runId: "run-42" });
  for (const secret of SECRET_MARKERS) assert.equal(JSON.stringify(result).includes(secret), false);
});

test("signature verification binds signed APK to unsigned Build artifact and certificate", async () => {
  const { verifySignedApkResult } = await signing();
  const profile = gateContext().profiles["lighthouse-production"];
  const failed = verifySignedApkResult(request(), profile, {
    exists: true, sha256: SIGNED_DIGEST, applicationId: request().applicationId,
    versionName: request().versionName, versionCode: request().versionCode,
    certificateSha256: CERT, signatureValid: false, workflowRunId: "run-42",
  });
  assert.equal(failed.state, "SIGNATURE_VERIFY_FAILED");
  assert.equal(failed.code, "APK_SIGNATURE_INVALID");

  const verified = verifySignedApkResult(request(), profile, {
    id: "signed-apk", exists: true, location: "artifact://signed.apk", sha256: SIGNED_DIGEST,
    applicationId: request().applicationId, versionName: request().versionName, versionCode: request().versionCode,
    certificateSha256: CERT, signatureValid: true, workflowRunId: "run-42", verifiedAt: "2026-09-16T00:00:00.000Z",
  });
  assert.equal(verified.state, "SIGNATURE_VERIFIED");
  assert.deepEqual(verified.evidence, {
    sourceSha: SOURCE_SHA,
    unsignedApkSha256: UNSIGNED_DIGEST,
    signedApkSha256: SIGNED_DIGEST,
    certificateSha256: CERT,
    signingWorkflowRunId: "run-42",
    signingProfileId: "lighthouse-production",
    verificationResult: "pass",
    verifiedAt: "2026-09-16T00:00:00.000Z",
  });
  assert.equal(verified.artifact.id, "signed-apk");
  assert.equal(verified.artifact.sourceArtifactId, "unsigned-apk");
  assert.equal(verified.artifact.digest, SIGNED_DIGEST);
  assert.equal(verified.artifact.status, "SIGNATURE_VERIFIED");
});

test("APK CodeTask cannot Product QC unsigned build and advances through Signing Gate to signed digest", async () => {
  const { createCodeTask, createCodeTaskFromSnapshot } = await taskModule();
  const { evaluateApkSigningGate, verifySignedApkResult } = await signing();
  const base = createCodeTask({ id: "apk-task", repository: "pureekangraw-ops/ygph-metropolis" }).snapshot();
  let task = createCodeTaskFromSnapshot({
    ...base,
    blueprint: { ref: "spec.md", status: "approved" },
    factoryStage: "BUILD",
    buildArtifact: buildArtifact(),
    evidence: [{ id: "unsigned-qc", scope: "artifact", claim: "artifact-loads", value: { digest: UNSIGNED_DIGEST } }],
  });
  assert.equal(task.nextAction, "signing-gate");
  assert.throws(() => task.recordProductQc({
    status: "pass", artifactId: "unsigned-apk", artifactDigest: UNSIGNED_DIGEST,
    checks: {}, evidenceIds: ["unsigned-qc"], checkedAt: "now",
  }), /Signing Gate/);

  const gate = evaluateApkSigningGate(request(), gateContext());
  task = task.recordSigningGate(gate);
  assert.equal(task.factoryStage, "SIGNING_GATE");
  assert.equal(task.nextAction, "sign-apk");

  const verified = verifySignedApkResult(request(), gateContext().profiles["lighthouse-production"], {
    id: "signed-apk", exists: true, location: "artifact://signed.apk", sha256: SIGNED_DIGEST,
    applicationId: request().applicationId, versionName: request().versionName, versionCode: request().versionCode,
    certificateSha256: CERT, signatureValid: true, workflowRunId: "run-42", verifiedAt: "now",
  });
  task = task.recordSignedArtifact(verified);
  assert.equal(task.factoryStage, "SIGNATURE_VERIFIED");
  assert.equal(task.nextAction, "product-qc");
  assert.equal(task.signedArtifact.digest, SIGNED_DIGEST);

  task = task.addEvidence({ id: "signed-load", scope: "artifact", claim: "artifact-loads", value: { digest: SIGNED_DIGEST } })
    .addEvidence({ id: "signed-flow", scope: "artifact", claim: "core-flow-correct", value: { digest: SIGNED_DIGEST } })
    .addEvidence({ id: "signed-outcome", scope: "artifact", claim: "blueprint-outcome-correct", value: { digest: SIGNED_DIGEST } })
    .recordProductQc({
      status: "pass", artifactId: "signed-apk", artifactDigest: SIGNED_DIGEST,
      checks: {}, evidenceIds: ["signed-load", "signed-flow", "signed-outcome"], checkedAt: "now",
    });
  assert.equal(task.factoryStage, "PRODUCT_VERIFIED");
  assert.equal(task.productQc.artifactDigest, SIGNED_DIGEST);
});

test("signing APIs never return hostile secret material", async () => {
  const { evaluateApkSigningGate, verifySignedApkResult } = await signing();
  const hostile = { ...request(), rawKeystore: SECRET_MARKERS[0], signingPassword: SECRET_MARKERS[1], keyPassword: SECRET_MARKERS[2] };
  const values = [
    evaluateApkSigningGate(hostile, gateContext()),
    verifySignedApkResult(hostile, gateContext().profiles["lighthouse-production"], {
      id: "signed-apk", exists: true, location: "artifact://signed.apk", sha256: SIGNED_DIGEST,
      applicationId: hostile.applicationId, versionName: hostile.versionName, versionCode: hostile.versionCode,
      certificateSha256: CERT, signatureValid: true, workflowRunId: "run-42", verifiedAt: "now",
    }),
  ];
  const serialized = JSON.stringify(values);
  for (const secret of SECRET_MARKERS) assert.equal(serialized.includes(secret), false);
});
