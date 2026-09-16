"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const artifactUrl = pathToFileURL(path.join(root, "go-hub-artifact.js")).href;
const scannerUrl = pathToFileURL(path.join(root, "go-hub-verification-scanner.js")).href;
const taskUrl = pathToFileURL(path.join(root, "go-hub-code-task.js")).href;

const assembly = { id: "a1", blueprintRef: "spec.md", integrationHeadSha: "assembly-head", status: "ASSEMBLED" };
const assemblyQc = { status: "pass", checkedHeadSha: "assembly-head" };
const mergeGate = {
  status: "MERGED_VERIFIED",
  assemblyId: "a1",
  sourceHeadSha: "assembly-head",
  pullRequestNumber: 68,
  pullRequestHeadSha: "assembly-head",
  ciHeadSha: "assembly-head",
  mergeSha: "main-1",
  mainSha: "main-1",
  checkedAt: "now",
};

function productionToPiece(task) {
  return task
    .recordProductionStep({ step: "INSPECT_REALITY", evidence: { repository: "repo", headSha: "base-head" } })
    .recordProductionStep({ step: "BASELINE", evidence: { baseSha: "base-head" } })
    .recordProductionStep({ step: "TRACE", evidence: { summary: "trace before build" } })
    .recordProductionStep({ step: "PLAN", evidence: { blueprintRef: "spec.md", planRef: "plan://merge-task" } })
    .recordPiece({ id: "p", workPackageId: "wp", repository: "repo", branch: "b", headSha: "piece-head" })
    .recordProductionStep({ step: "LOCAL_VERIFY", evidence: { status: "pass", headSha: "piece-head", checks: { test: "pass" } } });
}

test("Build requires a verified Merge Gate and binds Artifact to verified main SHA", async () => {
  const { createBuildArtifact } = await import(`${artifactUrl}?merge=${Date.now()}`);
  assert.throws(() => createBuildArtifact({
    id: "art1", kind: "web", assembly, assemblyQc,
    digest: "sha256:1", location: "https://app.test", builtAt: "now",
  }), /Merge Gate/);

  const artifact = createBuildArtifact({
    id: "art1", kind: "web", assembly, assemblyQc, mergeGate,
    digest: "sha256:1", location: "https://app.test", builtAt: "now",
  });
  assert.equal(artifact.sourceHeadSha, "main-1");
  assert.equal(artifact.assemblyHeadSha, "assembly-head");

  assert.throws(() => createBuildArtifact({
    id: "art2", kind: "web", assembly, assemblyQc,
    mergeGate: { ...mergeGate, sourceHeadSha: "stale" },
    digest: "sha256:2", location: "https://app.test/2", builtAt: "now",
  }), /Merge Gate/);
});

test("CodeTask cannot enter Build until PR CI merge and post-merge main truth are sealed", async () => {
  const { createCodeTask } = await import(`${taskUrl}?merge=${Date.now()}`);
  let task = createCodeTask({ id: "merge-task", repository: "repo" })
    .setWorkbenchTruth({ blueprint: { ref: "spec.md" } })
    .setWorkPackage({ id: "wp", title: "piece", purpose: "build", blueprintRef: "spec.md", inputs: [], expectedOutputs: [], dependencies: [], assemblyTarget: "app" });
  task = productionToPiece(task)
    .addEvidence({ id: "pev", scope: "piece", claim: "piece-correct", kind: "test", headSha: "piece-head" })
    .recordPieceQc({ status: "pass", checkedHeadSha: "piece-head", checks: {}, evidenceIds: ["pev"], checkedAt: "now" })
    .recordGateHandoff({ status: "READY_FOR_ASSEMBLY", pieceId: "p", workPackageId: "wp", blueprintRef: "spec.md", headSha: "piece-head", evidenceIds: ["pev"] })
    .recordAssembly({ id: "a1", blueprintRef: "spec.md", pieceIds: ["p"], sourceHeads: ["piece-head"], repository: "repo", integrationBranch: "integration", integrationHeadSha: "assembly-head", status: "ASSEMBLED" })
    .addEvidence({ id: "aev", scope: "assembly", claim: "assembly-correct", kind: "test", headSha: "assembly-head" })
    .recordAssemblyQc({ status: "pass", checkedHeadSha: "assembly-head", checks: {}, evidenceIds: ["aev"], checkedAt: "now" });

  assert.throws(() => task.recordBuildArtifact({
    id: "artifact", kind: "web", assemblyId: "a1", sourceHeadSha: "assembly-head",
    blueprintRef: "spec.md", digest: "digest", location: "x", builtAt: "now", status: "BUILT",
  }), /Merge Gate/);

  task = task.recordMergeGate({
    status: "MERGED_VERIFIED", assemblyId: "a1", sourceHeadSha: "assembly-head",
    pullRequest: { number: 68, headSha: "assembly-head" },
    ci: { status: "success", headSha: "assembly-head" },
    merge: { headSha: "assembly-head", mergeSha: "main-1", pullRequestNumber: 68 },
    postMergeVerification: { status: "pass", mainSha: "main-1", checkedAt: "now" },
  });
  assert.equal(task.factoryStage, "MERGE_GATE");
  assert.equal(task.nextAction, "build");

  task = task.recordBuildArtifact({
    id: "artifact", kind: "web", assemblyId: "a1", sourceHeadSha: "main-1",
    blueprintRef: "spec.md", digest: "digest", location: "x", builtAt: "now", status: "BUILT",
  });
  assert.equal(task.buildArtifact.sourceHeadSha, "main-1");
});

test("Verification Scanner includes Merge Gate in the required truth chain", async () => {
  const { scanFactoryTruth } = await import(`${scannerUrl}?merge=${Date.now()}`);
  const truth = {
    blueprint: { ref: "spec.md", status: "approved" },
    piece: { id: "p", headSha: "piece-head" },
    pieceQc: { status: "pass", checkedHeadSha: "piece-head" },
    gateHandoff: { status: "READY_FOR_ASSEMBLY", headSha: "piece-head", blueprintRef: "spec.md" },
    assembly,
    assemblyQc,
    mergeGate,
    buildArtifact: { id: "artifact", digest: "digest-1", sourceHeadSha: "main-1", assemblyHeadSha: "assembly-head", blueprintRef: "spec.md", status: "BUILT" },
    productQc: { status: "pass", artifactId: "artifact", artifactDigest: "digest-1" },
    factoryStage: "PRODUCT_VERIFIED",
  };
  const result = scanFactoryTruth(truth);
  assert.equal(result.status, "VERIFIED_CHAIN");
  assert.deepEqual(result.checkedStations, ["blueprint", "piece-qc", "ready-gate", "assembly-qc", "merge-gate", "artifact", "product-qc"]);

  truth.mergeGate = { ...mergeGate, mainSha: "other" };
  const broken = scanFactoryTruth(truth);
  assert.equal(broken.status, "FIRST_BROKEN_TRUTH");
  assert.equal(broken.station, "merge-gate");
});
