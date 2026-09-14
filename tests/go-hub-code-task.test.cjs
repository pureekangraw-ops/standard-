"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = pathToFileURL(path.join(root, "go-hub-code-task.js")).href;

async function load() {
  return import(`${moduleUrl}?task=${Date.now()}-${Math.random()}`);
}

test("task advances inspect to branch/edit/diff with SHA-bound evidence", async () => {
  const { createCodeTask } = await load();
  let task = createCodeTask({ id: "task-1", intent: "edit hub", repository: "pureekangraw-ops/standard-" });
  assert.equal(task.state, "INSPECTING");
  assert.equal(task.nextAction, "inspect");

  task = task.transition("BRANCH_READY", { baseBranch: "main", baseSha: "base-1", workBranch: "feature-a", headSha: "head-1" });
  assert.equal(task.nextAction, "edit");
  task = task.transition("EDITING", { headSha: "head-1", touchedPaths: ["src/app.js"] });
  task = task.transition("DIFF_REVIEWED", { headSha: "head-1", diffFingerprint: "diff-1" });
  assert.equal(task.nextAction, "test");
  assert.equal(task.snapshot().diffFingerprint, "diff-1");
  assert.equal(task.snapshot().audit.length >= 3, true);
});

test("task enters explicit conflict and blocker states", async () => {
  const { createCodeTask } = await load();
  let task = createCodeTask({ id: "task-2", intent: "edit hub", repository: "pureekangraw-ops/standard-" });
  task = task.transition("CONFLICT", { blocker: "base diverged", headSha: "head-2" });
  assert.equal(task.state, "CONFLICT");
  assert.equal(task.blocker, "base diverged");
  assert.equal(task.nextAction, "resolve-conflict");
  task = task.transition("BLOCKED", { blocker: "manual approval" });
  assert.equal(task.state, "BLOCKED");
  assert.equal(task.nextAction, "resolve-blocker");
});

test("changing head invalidates reviewed diff evidence", async () => {
  const { createCodeTask } = await load();
  let task = createCodeTask({ id: "task-3", intent: "edit hub", repository: "pureekangraw-ops/standard-" });
  task = task.transition("BRANCH_READY", { baseBranch: "main", baseSha: "base-1", workBranch: "feature-a", headSha: "head-1" });
  task = task.transition("DIFF_REVIEWED", { headSha: "head-1", diffFingerprint: "diff-1" });
  task = task.transition("EDITING", { headSha: "head-2", touchedPaths: ["src/app.js"] });
  const snapshot = task.snapshot();
  assert.equal(snapshot.headSha, "head-2");
  assert.equal(snapshot.diffFingerprint, null);
  assert.equal(snapshot.nextAction, "review-diff");
});


test("a new head invalidates prior PR CI evidence", async () => {
  const { createCodeTask } = await load();
  let task = createCodeTask({ id: "task-ci", repository: "pureekangraw-ops/standard-" });
  task = task.transition("BRANCH_READY", {
    baseBranch: "main", baseSha: "base-1", workBranch: "feature-a", headSha: "head-1",
  });
  task = task.transition("PR_OPEN", {
    headSha: "head-1", pullRequest: { number: 19, headSha: "head-1" },
  });
  task = task.transition("CI_GREEN", {
    headSha: "head-1", ci: { headSha: "head-1", conclusion: "success" },
  });
  assert.equal(task.snapshot().ci.conclusion, "success");

  task = task.transition("EDITING", { headSha: "head-2", touchedPaths: ["src/app.js"] });
  const snapshot = task.snapshot();
  assert.equal(snapshot.pullRequest, null);
  assert.equal(snapshot.ci, null);
  assert.equal(snapshot.nextAction, "review-diff");
});


test("task binds committed PR and CI transitions to the current head", async () => {
  const { createCodeTask } = await load();
  let task = createCodeTask({ id: "task-pr-ci", repository: "pureekangraw-ops/standard-" });
  task = task.transition("BRANCH_READY", {
    baseBranch: "main", baseSha: "base-1", workBranch: "feature-c", headSha: "head-c",
  });
  task = task.transition("COMMITTED", { headSha: "head-c" });
  assert.equal(task.nextAction, "open-pr");
  task = task.transition("PR_OPEN", {
    headSha: "head-c",
    pullRequest: { number: 19, headBranch: "feature-c", headSha: "head-c", baseBranch: "main" },
  });
  assert.equal(task.nextAction, "check-ci");
  task = task.transition("CI_RUNNING", {
    headSha: "head-c", ci: { headSha: "head-c", conclusion: null, runs: [{ id: 7, status: "in_progress" }] },
  });
  assert.equal(task.nextAction, "check-ci");
  task = task.transition("CI_FAILED", {
    headSha: "head-c", ci: { headSha: "head-c", conclusion: "failure", runs: [{ id: 7, conclusion: "failure" }] },
  });
  assert.equal(task.nextAction, "fix-ci");
  task = task.transition("CI_GREEN", {
    headSha: "head-c", ci: { headSha: "head-c", conclusion: "success", runs: [{ id: 8, conclusion: "success" }] },
  });
  assert.equal(task.nextAction, "merge");
});

test("task rejects PR or CI evidence for a different head SHA", async () => {
  const { createCodeTask } = await load();
  let task = createCodeTask({ id: "task-stale", repository: "pureekangraw-ops/standard-" });
  task = task.transition("BRANCH_READY", {
    baseBranch: "main", baseSha: "base-1", workBranch: "feature-c", headSha: "head-current",
  });
  assert.throws(() => task.transition("PR_OPEN", {
    headSha: "head-current",
    pullRequest: { number: 19, headSha: "head-stale" },
  }), /pull request head SHA does not match current head/);
  assert.throws(() => task.transition("CI_GREEN", {
    headSha: "head-current",
    ci: { headSha: "head-stale", conclusion: "success" },
  }), /CI head SHA does not match current head/);
});


test("deploy success remains incomplete until successful verification evidence", async () => {
  const { createCodeTask } = await load();
  let task = createCodeTask({ id: "task-deploy", repository: "pureekangraw-ops/standard-" });
  task = task.transition("BRANCH_READY", {
    baseBranch: "main", baseSha: "base-d", workBranch: "feature-d", headSha: "head-d",
  });
  task = task.transition("CI_GREEN", {
    headSha: "head-d", ci: { headSha: "head-d", conclusion: "success" },
  });
  task = task.transition("MERGED", {
    headSha: "head-d", merge: { headSha: "head-d", mergeSha: "merge-d", pullRequestNumber: 19 },
  });
  task = task.transition("DEPLOYING", {
    deployment: { sha: "merge-d", runId: 91, status: "in_progress" },
  });
  task = task.transition("DEPLOYED", {
    deployment: { sha: "merge-d", runId: 91, status: "success" },
  });
  assert.equal(task.state, "DEPLOYED");
  assert.equal(task.nextAction, "verify");
  assert.throws(() => task.transition("VERIFIED"), /successful verification evidence is required/);
  task = task.transition("VERIFIED", {
    verification: {
      kind: "http", target: "https://hub.example/health", status: "success",
      evidence: { status: 200 }, timestamp: "2026-09-14T05:30:00.000Z",
    },
  });
  assert.equal(task.state, "VERIFIED");
  assert.equal(task.nextAction, "complete");
  assert.equal(task.snapshot().verification.status, "success");
});

test("task exposes explicit rollback entries for edits, branch commits, and merged code", async () => {
  const { createCodeTask } = await load();
  const cases = [
    { from: "EDITING", kind: "discard-pending-edits" },
    { from: "COMMITTED", kind: "reset-work-branch" },
    { from: "MERGED", kind: "revert-merge" },
  ];
  for (const item of cases) {
    let task = createCodeTask({ id: "rollback-" + item.from, repository: "pureekangraw-ops/standard-" });
    task = task.transition("BRANCH_READY", {
      baseBranch: "main", baseSha: "base-d", workBranch: "feature-d", headSha: "head-d",
    });
    task = task.transition(item.from, { headSha: "head-d" });
    task = task.transition("ROLLBACK_IN_PROGRESS", {
      rollback: { kind: item.kind, reason: "operator requested", headSha: "head-d" },
    });
    assert.equal(task.nextAction, "continue-rollback");
    assert.equal(task.snapshot().rollback.kind, item.kind);
  }
});

test("task rejects a rollback kind that does not match the current lifecycle state", async () => {
  const { createCodeTask } = await load();
  let task = createCodeTask({ id: "rollback-invalid", repository: "pureekangraw-ops/standard-" });
  task = task.transition("BRANCH_READY", {
    baseBranch: "main", baseSha: "base-d", workBranch: "feature-d", headSha: "head-d",
  });
  task = task.transition("EDITING", { headSha: "head-d" });
  assert.throws(() => task.transition("ROLLBACK_IN_PROGRESS", {
    rollback: { kind: "revert-merge", headSha: "head-d" },
  }), /rollback kind does not match current state/);
});


test("task restores exact durable snapshot and appends specialist audit to one authority record", async () => {
  const { createCodeTaskFromSnapshot } = await load();
  const stored = {
    id: "task-resume", intent: "continue", repository: "pureekangraw-ops/standard-",
    state: "CI_RUNNING", nextAction: "check-ci", baseBranch: "main", baseSha: "base-1",
    workBranch: "feature-a", headSha: "head-1", touchedPaths: ["src/app.js"],
    diffFingerprint: "diff-1", blocker: null, pullRequest: { number: 19, headSha: "head-1" },
    ci: { headSha: "head-1", conclusion: null }, merge: null, deployment: null,
    verification: null, rollback: null, mission: null, blueprint: null,
    currentPiece: null, evidence: [],
    audit: [{ at: "2026-09-14T00:00:00.000Z", event: "CI_STARTED" }],
  };
  let task = createCodeTaskFromSnapshot(stored);
  assert.deepEqual(task.snapshot(), {
    ...stored, factoryStage: null, workPackage: null, piece: null, pieceQc: null, gateHandoff: null,
    assembly: null, assemblyQc: null, buildArtifact: null, productQc: null,
    verificationScan: null, closeout: null, lessons: [],
  });
  task = task.appendAudit("SPECIALIST_RETURN", { specialist: "slice-c", result: "green" });
  const resumed = task.snapshot();
  assert.equal(resumed.id, stored.id);
  assert.equal(resumed.audit.length, 2);
  assert.equal(resumed.audit[1].event, "SPECIALIST_RETURN");
  assert.equal(resumed.audit[1].specialist, "slice-c");
  assert.equal(resumed.audit[1].result, "green");
});

test("task stores one workbench truth set and audits the update", async () => {
  const { createCodeTask } = await load();
  let task = createCodeTask({ id: "wb-1", intent: "build workstation", repository: "pureekangraw-ops/standard-" });
  assert.equal(task.mission, null);
  assert.equal(task.blueprint, null);
  assert.equal(task.currentPiece, null);
  assert.deepEqual(task.evidence, []);

  task = task.setWorkbenchTruth({
    mission: { summary: "Build Engine 1", outcome: "Resumable Workbench truth" },
    blueprint: { title: "Factory Blueprint", ref: "docs/superpowers/specs/2026-09-14-go-hub-code-station-engine-map-design.md", status: "approved" },
    currentPiece: { id: "engine-1", title: "Truth & Workbench", purpose: "Expose one resumable truth set" },
    evidence: [{ kind: "design", label: "Approved blueprint", value: "aa7d779" }],
  });

  const snapshot = task.snapshot();
  assert.equal(snapshot.mission.summary, "Build Engine 1");
  assert.equal(snapshot.blueprint.status, "approved");
  assert.equal(snapshot.currentPiece.id, "engine-1");
  assert.deepEqual(snapshot.evidence, [{ kind: "design", label: "Approved blueprint", value: "aa7d779" }]);
  assert.equal(snapshot.audit.at(-1).event, "WORKBENCH_TRUTH_UPDATED");
});

test("legacy snapshots restore with safe workbench defaults", async () => {
  const { createCodeTaskFromSnapshot } = await load();
  const legacy = {
    id: "legacy", intent: "resume", repository: "pureekangraw-ops/standard-",
    state: "INSPECTING", nextAction: "inspect", baseBranch: null, baseSha: null,
    workBranch: null, headSha: null, touchedPaths: [], diffFingerprint: null,
    blocker: null, pullRequest: null, ci: null, merge: null, deployment: null,
    verification: null, rollback: null, audit: [],
  };
  const restored = createCodeTaskFromSnapshot(legacy).snapshot();
  assert.equal(restored.mission, null);
  assert.equal(restored.blueprint, null);
  assert.equal(restored.currentPiece, null);
  assert.deepEqual(restored.evidence, []);
  assert.equal(restored.factoryStage, null);
  assert.equal(restored.workPackage, null);
  assert.equal(restored.piece, null);
  assert.equal(restored.pieceQc, null);
  assert.equal(restored.gateHandoff, null);
  assert.equal(restored.assembly, null);
  assert.equal(restored.assemblyQc, null);
  assert.equal(restored.buildArtifact, null);
  assert.equal(restored.productQc, null);
});

test("production truth is resumable and bound to the mounted blueprint", async () => {
  const { createCodeTask, createCodeTaskFromSnapshot } = await load();
  let task = createCodeTask({ id: "e2-1", repository: "pureekangraw-ops/standard-" })
    .setWorkbenchTruth({
      blueprint: { title: "Factory Blueprint", ref: "spec.md", status: "approved" },
      currentPiece: { id: "wp-1", title: "Old piece", purpose: "stale" },
    });

  task = task.setWorkPackage({
    id: "wp-1", title: "Piece Controller", purpose: "control one work package",
    blueprintRef: "spec.md", inputs: ["CodeTask snapshot"], expectedOutputs: ["sealed piece"],
    dependencies: [], assemblyTarget: "Engine 2 production line",
  });
  task = task.recordPiece({
    id: "piece-1", workPackageId: "wp-1", repository: "pureekangraw-ops/standard-",
    branch: "engine-2", headSha: "head-1", changedPaths: ["go-hub-code-task.js"], outputs: ["piece truth"],
  }).addEvidence({ id: "ev-1", scope: "piece", claim: "purpose-correct", kind: "test", headSha: "head-1" });
  task = task.recordPieceQc({
    status: "pass", checkedHeadSha: "head-1",
    checks: { purpose: true, behavior: true, interface: true, evidence: true },
    evidenceIds: ["ev-1"], checkedAt: "2026-09-14T12:00:00.000Z",
  });
  task = task.recordGateHandoff({
    status: "READY_FOR_ASSEMBLY", pieceId: "piece-1", workPackageId: "wp-1",
    blueprintRef: "spec.md", headSha: "head-1", evidenceIds: ["ev-1"],
  });

  const restored = createCodeTaskFromSnapshot(task.snapshot()).snapshot();
  assert.equal(restored.factoryStage, "READY_GATE");
  assert.equal(restored.workPackage.id, "wp-1");
  assert.equal(restored.currentPiece.title, "Piece Controller");
  assert.equal(restored.piece.headSha, "head-1");
  assert.equal(restored.pieceQc.checkedHeadSha, "head-1");
  assert.equal(restored.gateHandoff.status, "READY_FOR_ASSEMBLY");
});

test("production rejects blueprint drift and new piece revisions invalidate QC and handoff", async () => {
  const { createCodeTask } = await load();
  let task = createCodeTask({ id: "e2-boundary" }).setWorkbenchTruth({
    blueprint: { ref: "approved.md" },
  });
  assert.throws(() => task.setWorkPackage({
    id: "wp-1", title: "Piece", purpose: "prove boundary", blueprintRef: "other.md",
    inputs: [], expectedOutputs: [], dependencies: [], assemblyTarget: "line",
  }), /mounted blueprint/);

  task = task.setWorkPackage({
    id: "wp-1", title: "Piece", purpose: "prove boundary", blueprintRef: "approved.md",
    inputs: [], expectedOutputs: [], dependencies: [], assemblyTarget: "line",
  });
  assert.throws(() => task.recordPiece({
    id: "piece-1", workPackageId: "other", repository: "repo", branch: "branch", headSha: "head-1",
  }), /work package/);
  task = task.recordPiece({
    id: "piece-1", workPackageId: "wp-1", repository: "repo", branch: "branch", headSha: "head-1",
  }).addEvidence({ id: "ev-1", scope: "piece", claim: "purpose-correct", kind: "test", headSha: "head-1" })
    .recordPieceQc({ status: "pass", checkedHeadSha: "head-1", checks: {}, evidenceIds: ["ev-1"], checkedAt: "now" })
    .recordGateHandoff({
      status: "READY_FOR_ASSEMBLY", pieceId: "piece-1", workPackageId: "wp-1",
      blueprintRef: "approved.md", headSha: "head-1", evidenceIds: ["ev-1"],
    });
  task = task.recordPiece({
    id: "piece-1", workPackageId: "wp-1", repository: "repo", branch: "branch", headSha: "head-2",
  });
  assert.equal(task.factoryStage, "PRODUCTION");
  assert.equal(task.pieceQc, null);
  assert.equal(task.gateHandoff, null);
});

test("task cannot enter Ready Gate by recording a handoff that bypasses exact-head Piece QC", async () => {
  const { createCodeTask } = await load();
  let task = createCodeTask({ id: "e2-no-bypass" }).setWorkbenchTruth({ blueprint: { ref: "spec.md" } })
    .setWorkPackage({
      id: "wp-1", title: "Piece", purpose: "prevent bypass", blueprintRef: "spec.md",
      inputs: [], expectedOutputs: [], dependencies: [], assemblyTarget: "future assembly",
    }).recordPiece({
      id: "piece-1", workPackageId: "wp-1", repository: "repo", branch: "engine-2", headSha: "head-1",
    });
  assert.throws(() => task.recordGateHandoff({
    status: "READY_FOR_ASSEMBLY", pieceId: "piece-1", workPackageId: "wp-1",
    blueprintRef: "spec.md", headSha: "head-1", evidenceIds: [],
  }), /passed Piece QC/);

  task = task.recordPieceQc({
    status: "pass", checkedHeadSha: "head-1",
    checks: { purpose: true, behavior: true, interface: true, evidence: true },
    evidenceIds: ["missing"], checkedAt: "2026-09-14T12:00:00.000Z",
  });
  assert.throws(() => task.recordGateHandoff({
    status: "READY_FOR_ASSEMBLY", pieceId: "piece-1", workPackageId: "wp-1",
    blueprintRef: "spec.md", headSha: "head-1", evidenceIds: ["missing"],
  }), /evidence/);
});

test("assembly and product truth is resumable and invalidates downstream results", async () => {
  const { createCodeTask, createCodeTaskFromSnapshot } = await load();
  let task = createCodeTask({ id: "e3-task" }).setWorkbenchTruth({ blueprint: { ref: "spec.md" } })
    .setWorkPackage({ id: "wp-1", title: "Piece", purpose: "input", blueprintRef: "spec.md", inputs: [], expectedOutputs: [], dependencies: [], assemblyTarget: "app" })
    .recordPiece({ id: "piece-1", workPackageId: "wp-1", repository: "repo", branch: "e2", headSha: "piece-head" })
    .addEvidence({ id: "piece-ev", scope: "piece", claim: "purpose-correct", kind: "test", headSha: "piece-head" })
    .recordPieceQc({ status: "pass", checkedHeadSha: "piece-head", checks: {}, evidenceIds: ["piece-ev"], checkedAt: "now" })
    .recordGateHandoff({ status: "READY_FOR_ASSEMBLY", pieceId: "piece-1", workPackageId: "wp-1", blueprintRef: "spec.md", headSha: "piece-head", evidenceIds: ["piece-ev"] });

  task = task.recordAssembly({ id: "assembly-1", blueprintRef: "spec.md", pieceIds: ["piece-1"], sourceHeads: ["piece-head"], repository: "repo", integrationBranch: "e3", integrationHeadSha: "assembly-head", status: "ASSEMBLED" });
  assert.equal(task.factoryStage, "ASSEMBLY");
  task = task.addEvidence({ id: "assembly-ev", scope: "assembly", claim: "structure-correct", kind: "test", headSha: "assembly-head" })
    .recordAssemblyQc({ status: "pass", checkedHeadSha: "assembly-head", checks: {}, evidenceIds: ["assembly-ev"], checkedAt: "now" });
  task = task.recordBuildArtifact({ id: "artifact-1", kind: "web", assemblyId: "assembly-1", sourceHeadSha: "assembly-head", blueprintRef: "spec.md", digest: "digest-1", location: "https://example.test", builtAt: "now", status: "BUILT" });
  task = task.addEvidence({ id: "artifact-ev", scope: "artifact", claim: "artifact-loads", kind: "probe", value: { digest: "digest-1" } })
    .recordProductQc({ status: "pass", artifactId: "artifact-1", artifactDigest: "digest-1", checks: {}, evidenceIds: ["artifact-ev"], checkedAt: "now" });
  const restored = createCodeTaskFromSnapshot(task.snapshot()).snapshot();
  assert.equal(restored.factoryStage, "PRODUCT_VERIFIED");
  assert.equal(restored.assembly.integrationHeadSha, "assembly-head");
  assert.equal(restored.buildArtifact.digest, "digest-1");

  task = task.recordBuildArtifact({ id: "artifact-2", kind: "web", assemblyId: "assembly-1", sourceHeadSha: "assembly-head", blueprintRef: "spec.md", digest: "digest-2", location: "https://example.test/v2", builtAt: "later", status: "BUILT" });
  assert.equal(task.factoryStage, "BUILD");
  assert.equal(task.productQc, null);
});

test("product verification rejects stale assembly and artifact evidence", async () => {
  const { createCodeTask } = await load();
  const task = createCodeTask({ id: "e3-guard" }).setWorkbenchTruth({ blueprint: { ref: "spec.md" } });
  assert.throws(() => task.recordAssembly({ status: "ASSEMBLED" }), /Ready Gate/);
});

test("Engine 4 truth records scan closeout and lessons with exact artifact binding", async () => {
  const { createCodeTask, createCodeTaskFromSnapshot } = await load();
  let task = createCodeTask({ id: "e4" });
  const base = task.snapshot();
  task = createCodeTaskFromSnapshot({ ...base, factoryStage: "PRODUCT_VERIFIED", blueprint: { ref: "spec.md" }, buildArtifact: { id: "artifact", digest: "digest-1", status: "BUILT" }, productQc: { status: "pass", artifactId: "artifact", artifactDigest: "digest-1" } });
  task = task.recordVerificationScan({ status: "VERIFIED_CHAIN", artifactId: "artifact", artifactDigest: "digest-1", checkedStations: ["product-qc"], scannedAt: "now" });
  assert.equal(task.factoryStage, "VERIFIED_CHAIN");
  task = task.recordCloseout({ status: "CLOSEOUT_READY", taskId: "e4", finalArtifact: { id: "artifact", digest: "digest-1" }, transientKeys: [], obsoleteKeys: [], plannedAt: "now" });
  assert.equal(task.factoryStage, "CLOSED");
  task = task.recordLesson({ id: "lesson", context: "stale head", action: "scan", finding: "first break", resolution: "rerun qc", reusableWhen: "head changes", sourceTaskId: "e4", sourceArtifactDigest: "digest-1", recordedAt: "now", status: "RECORDED" });
  const restored = createCodeTaskFromSnapshot(task.snapshot()).snapshot();
  assert.equal(restored.factoryStage, "LEARNED");
  assert.equal(restored.verificationScan.artifactDigest, "digest-1");
  assert.equal(restored.closeout.finalArtifact.digest, "digest-1");
  assert.deepEqual(restored.lessons.map(item => item.id), ["lesson"]);
  assert.throws(() => task.recordLesson({ id: "stale", sourceTaskId: "e4", sourceArtifactDigest: "other", status: "RECORDED" }), /current Artifact/);
});

test("legacy task snapshots restore with empty Engine 4 truth", async () => {
  const { createCodeTask, createCodeTaskFromSnapshot } = await load();
  const snapshot = createCodeTask({ id: "legacy" }).snapshot();
  delete snapshot.verificationScan; delete snapshot.closeout; delete snapshot.lessons;
  const restored = createCodeTaskFromSnapshot(snapshot).snapshot();
  assert.equal(restored.verificationScan, null);
  assert.equal(restored.closeout, null);
  assert.deepEqual(restored.lessons, []);
});
