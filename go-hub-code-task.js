import { appendEvidence } from "./go-hub-evidence-ledger.js";
import { deriveFactoryNextAction } from "./go-hub-factory-authority.js";

const NEXT_ACTION = Object.freeze({
  INSPECTING: "inspect",
  BRANCH_READY: "edit",
  EDITING: "review-diff",
  DIFF_REVIEWED: "test",
  TESTED_OR_TEST_DEFERRED: "commit",
  COMMITTED: "open-pr",
  PR_OPEN: "check-ci",
  CI_RUNNING: "check-ci",
  CI_GREEN: "merge",
  CI_FAILED: "fix-ci",
  MERGED: "track-deploy",
  DEPLOYING: "track-deploy",
  DEPLOYED: "verify",
  VERIFIED: "complete",
  BLOCKED: "resolve-blocker",
  CONFLICT: "resolve-conflict",
  DEPLOY_FAILED: "fix-deploy",
  VERIFY_FAILED: "fix-verify",
  ROLLBACK_IN_PROGRESS: "continue-rollback",
});

const PRODUCTION_ADVANCE = Object.freeze({
  INSPECT_REALITY: "BASELINE",
  BASELINE: "TRACE",
  TRACE: "PLAN",
  PLAN: "WRITE",
  LOCAL_VERIFY: "PIECE_READY",
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function now() {
  return new Date().toISOString();
}

function effectiveNextAction(state) {
  return deriveFactoryNextAction(state) || NEXT_ACTION[state.state];
}

function normalizeInitial(initial = {}) {
  return {
    id: String(initial.id || ""),
    intent: String(initial.intent || ""),
    repository: String(initial.repository || ""),
    state: "INSPECTING",
    nextAction: "inspect",
    baseBranch: null,
    baseSha: null,
    workBranch: null,
    headSha: null,
    touchedPaths: [],
    diffFingerprint: null,
    blocker: null,
    pullRequest: null,
    ci: null,
    merge: null,
    deployment: null,
    verification: null,
    rollback: null,
    mission: null,
    blueprint: null,
    currentPiece: null,
    evidence: [],
    factoryStage: null,
    workPackage: null,
    piece: null,
    pieceQc: null,
    gateHandoff: null,
    assembly: null,
    assemblyQc: null,
    mergeGate: null,
    buildArtifact: null,
    productQc: null,
    verificationScan: null,
    closeout: null,
    lessons: [],
    audit: [{ at: now(), event: "TASK_CREATED", state: "INSPECTING" }],
  };
}

function transitionState(current, nextState, evidence = {}) {
  const state = String(nextState || "");
  if (!NEXT_ACTION[state]) throw new Error(`unsupported state: ${state}`);

  const next = clone(current);
  const priorHead = next.headSha;
  const incomingHead = evidence.headSha == null ? priorHead : String(evidence.headSha);

  if (state === "PR_OPEN") {
    const pullRequestHead = evidence.pullRequest?.headSha == null ? null : String(evidence.pullRequest.headSha);
    if (!incomingHead || !pullRequestHead || pullRequestHead !== incomingHead) {
      throw new Error("pull request head SHA does not match current head");
    }
  }
  if (state === "CI_RUNNING" || state === "CI_GREEN" || state === "CI_FAILED") {
    const ciHead = evidence.ci?.headSha == null ? null : String(evidence.ci.headSha);
    if (!incomingHead || !ciHead || ciHead !== incomingHead) {
      throw new Error("CI head SHA does not match current head");
    }
  }

  if (state === "DEPLOYED" && evidence.deployment?.status !== "success") {
    throw new Error("successful deployment evidence is required");
  }
  if (state === "VERIFIED") {
    const verification = evidence.verification;
    if (!verification || verification.status !== "success" || !verification.kind ||
        !verification.target || verification.evidence == null || !verification.timestamp) {
      throw new Error("successful verification evidence is required");
    }
  }
  if (state === "ROLLBACK_IN_PROGRESS") {
    const rollbackKind = evidence.rollback?.kind;
    const expectedKind = {
      EDITING: "discard-pending-edits",
      COMMITTED: "reset-work-branch",
      MERGED: "revert-merge",
    }[current.state];
    if (!expectedKind || rollbackKind !== expectedKind) {
      throw new Error("rollback kind does not match current state");
    }
  }

  next.state = state;
  next.nextAction = NEXT_ACTION[state];

  if (Object.hasOwn(evidence, "baseBranch")) next.baseBranch = evidence.baseBranch == null ? null : String(evidence.baseBranch);
  if (Object.hasOwn(evidence, "baseSha")) next.baseSha = evidence.baseSha == null ? null : String(evidence.baseSha);
  if (Object.hasOwn(evidence, "workBranch")) next.workBranch = evidence.workBranch == null ? null : String(evidence.workBranch);
  if (Object.hasOwn(evidence, "headSha")) next.headSha = incomingHead;
  if (Object.hasOwn(evidence, "touchedPaths")) next.touchedPaths = Array.isArray(evidence.touchedPaths) ? [...evidence.touchedPaths] : [];
  if (Object.hasOwn(evidence, "pullRequest")) next.pullRequest = evidence.pullRequest == null ? null : clone(evidence.pullRequest);
  if (Object.hasOwn(evidence, "ci")) next.ci = evidence.ci == null ? null : clone(evidence.ci);
  if (Object.hasOwn(evidence, "merge")) next.merge = evidence.merge == null ? null : clone(evidence.merge);
  if (Object.hasOwn(evidence, "deployment")) next.deployment = evidence.deployment == null ? null : clone(evidence.deployment);
  if (Object.hasOwn(evidence, "verification")) next.verification = evidence.verification == null ? null : clone(evidence.verification);
  if (Object.hasOwn(evidence, "rollback")) next.rollback = evidence.rollback == null ? null : clone(evidence.rollback);
  if (Object.hasOwn(evidence, "blocker")) next.blocker = evidence.blocker == null ? null : String(evidence.blocker);
  else if (state !== "BLOCKED" && state !== "CONFLICT") next.blocker = null;

  if (priorHead && incomingHead && priorHead !== incomingHead) {
    next.diffFingerprint = null;
    next.pullRequest = null;
    next.ci = null;
    next.merge = null;
    next.deployment = null;
    next.verification = null;
    next.rollback = null;
  }
  if (state === "DIFF_REVIEWED") {
    if (!incomingHead) throw new Error("headSha is required for DIFF_REVIEWED");
    next.headSha = incomingHead;
    next.diffFingerprint = String(evidence.diffFingerprint || "");
    if (!next.diffFingerprint) throw new Error("diffFingerprint is required for DIFF_REVIEWED");
  }

  next.audit.push({
    at: now(),
    event: "STATE_TRANSITION",
    from: current.state,
    to: state,
    headSha: next.headSha,
  });

  return next;
}

function normalizeSnapshot(value) {
  const state = clone(value);
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("task snapshot is required");
  if (!NEXT_ACTION[state.state]) throw new Error("task snapshot state is invalid");
  if (!Array.isArray(state.audit)) throw new Error("task snapshot audit is required");
  state.mission = state.mission == null ? null : clone(state.mission);
  state.blueprint = state.blueprint == null ? null : clone(state.blueprint);
  state.currentPiece = state.currentPiece == null ? null : clone(state.currentPiece);
  state.evidence = Array.isArray(state.evidence) ? clone(state.evidence) : [];
  state.factoryStage = state.factoryStage == null ? null : String(state.factoryStage);
  state.workPackage = state.workPackage == null ? null : clone(state.workPackage);
  state.piece = state.piece == null ? null : clone(state.piece);
  state.pieceQc = state.pieceQc == null ? null : clone(state.pieceQc);
  state.gateHandoff = state.gateHandoff == null ? null : clone(state.gateHandoff);
  state.assembly = state.assembly == null ? null : clone(state.assembly);
  state.assemblyQc = state.assemblyQc == null ? null : clone(state.assemblyQc);
  if (Object.hasOwn(state, "mergeGate")) state.mergeGate = state.mergeGate == null ? null : clone(state.mergeGate);
  if (Object.hasOwn(state, "productionPhase")) state.productionPhase = state.productionPhase == null ? null : String(state.productionPhase);
  if (Object.hasOwn(state, "productionTrace")) state.productionTrace = Array.isArray(state.productionTrace) ? clone(state.productionTrace) : [];
  state.buildArtifact = state.buildArtifact == null ? null : clone(state.buildArtifact);
  state.productQc = state.productQc == null ? null : clone(state.productQc);
  state.verificationScan = state.verificationScan == null ? null : clone(state.verificationScan);
  state.closeout = state.closeout == null ? null : clone(state.closeout);
  state.lessons = Array.isArray(state.lessons) ? clone(state.lessons) : [];
  if (!state.factoryStage && state.nextAction !== NEXT_ACTION[state.state]) {
    throw new Error("task snapshot state is invalid");
  }
  state.nextAction = effectiveNextAction(state);
  return state;
}

function requiredString(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function setWorkPackageState(current, input = {}) {
  const blueprintRef = requiredString(input.blueprintRef, "work package blueprintRef");
  if (!current.blueprint?.ref || String(current.blueprint.ref) !== blueprintRef) {
    throw new Error("work package must match the mounted blueprint reference");
  }
  const next = clone(current);
  next.workPackage = {
    id: requiredString(input.id, "work package id"),
    title: requiredString(input.title, "work package title"),
    purpose: requiredString(input.purpose, "work package purpose"),
    blueprintRef,
    inputs: Array.isArray(input.inputs) ? clone(input.inputs) : [],
    expectedOutputs: Array.isArray(input.expectedOutputs) ? clone(input.expectedOutputs) : [],
    dependencies: Array.isArray(input.dependencies) ? clone(input.dependencies) : [],
    assemblyTarget: requiredString(input.assemblyTarget, "work package assemblyTarget"),
  };
  next.currentPiece = {
    id: next.workPackage.id,
    title: next.workPackage.title,
    purpose: next.workPackage.purpose,
  };
  next.factoryStage = "PRODUCTION";
  next.productionPhase = "INSPECT_REALITY";
  next.productionTrace = [];
  next.piece = null;
  next.pieceQc = null;
  next.gateHandoff = null;
  next.audit.push({ at: now(), event: "WORK_PACKAGE_STARTED", workPackageId: next.workPackage.id });
  return next;
}

function recordProductionStepState(current, input = {}) {
  if (current.factoryStage !== "PRODUCTION" || !current.workPackage) throw new Error("active Production work package is required");
  const expected = String(current.productionPhase || "INSPECT_REALITY");
  const step = requiredString(input.step, "Production step");
  if (step !== expected) throw new Error(`Production sequence expected ${expected} before ${step}`);
  const evidence = input.evidence && typeof input.evidence === "object" && !Array.isArray(input.evidence) ? clone(input.evidence) : {};

  if (step === "INSPECT_REALITY") {
    const repository = requiredString(evidence.repository, "Inspect Reality repository");
    requiredString(evidence.headSha, "Inspect Reality headSha");
    if (current.repository && repository !== current.repository) throw new Error("Inspect Reality repository must match the active task repository");
  } else if (step === "BASELINE") {
    const baseSha = requiredString(evidence.baseSha, "Baseline baseSha");
    const inspectHead = current.productionTrace?.find(item => item.step === "INSPECT_REALITY")?.evidence?.headSha;
    if (inspectHead && baseSha !== inspectHead) throw new Error("Baseline must match the inspected Reality head");
  } else if (step === "TRACE") {
    requiredString(evidence.summary, "Trace summary");
  } else if (step === "PLAN") {
    if (requiredString(evidence.blueprintRef, "Plan blueprintRef") !== current.blueprint?.ref) {
      throw new Error("Plan must match the mounted Blueprint");
    }
    requiredString(evidence.planRef, "Plan planRef");
  } else if (step === "LOCAL_VERIFY") {
    if (!current.piece) throw new Error("active Piece is required before Local Verify");
    if (evidence.status !== "pass") throw new Error("Local Verify pass is required before Piece QC");
    if (String(evidence.headSha || "") !== current.piece.headSha) throw new Error("Local Verify must match the active Piece head");
  } else if (step === "WRITE") {
    throw new Error("WRITE is completed by recording the Piece");
  } else {
    throw new Error(`unsupported Production step: ${step}`);
  }

  const nextPhase = PRODUCTION_ADVANCE[step];
  if (!nextPhase) throw new Error(`Production step cannot advance: ${step}`);
  const next = clone(current);
  next.productionTrace = Array.isArray(next.productionTrace) ? next.productionTrace : [];
  next.productionTrace.push({ step, evidence, recordedAt: now() });
  next.productionPhase = nextPhase;
  next.audit.push({ at: now(), event: "PRODUCTION_STEP_RECORDED", step, nextPhase });
  return next;
}

function recordPieceState(current, input = {}) {
  if (!current.workPackage) throw new Error("active work package is required");
  if (current.factoryStage !== "PRODUCTION" || current.productionPhase !== "WRITE") {
    throw new Error("Production sequence requires WRITE before recording the Piece");
  }
  const workPackageId = requiredString(input.workPackageId, "piece workPackageId");
  if (workPackageId !== current.workPackage.id) throw new Error("piece must match the active work package");
  const next = clone(current);
  next.piece = {
    id: requiredString(input.id, "piece id"),
    workPackageId,
    repository: requiredString(input.repository, "piece repository"),
    branch: requiredString(input.branch, "piece branch"),
    headSha: requiredString(input.headSha, "piece headSha"),
    changedPaths: Array.isArray(input.changedPaths) ? clone(input.changedPaths) : [],
    outputs: Array.isArray(input.outputs) ? clone(input.outputs) : [],
  };
  next.factoryStage = "PRODUCTION";
  next.productionPhase = "LOCAL_VERIFY";
  next.productionTrace = Array.isArray(next.productionTrace) ? next.productionTrace : [];
  next.productionTrace.push({ step: "WRITE", evidence: { repository: next.piece.repository, branch: next.piece.branch, headSha: next.piece.headSha, changedPaths: clone(next.piece.changedPaths) }, recordedAt: now() });
  next.pieceQc = null;
  next.gateHandoff = null;
  next.audit.push({ at: now(), event: "PIECE_RECORDED", pieceId: next.piece.id, headSha: next.piece.headSha });
  return next;
}

function recordPieceQcState(current, input = {}) {
  if (!current.piece) throw new Error("active Piece is required before Piece QC");
  if (current.productionPhase !== "PIECE_READY") throw new Error("Local Verify pass is required before Piece QC");
  const status = String(input.status || "");
  if (status !== "pass" && status !== "fail") throw new Error("Piece QC status must be pass or fail");
  if (String(input.checkedHeadSha || "") !== current.piece.headSha) {
    throw new Error("Piece QC checked head must match the active Piece head");
  }
  const next = clone(current);
  next.pieceQc = {
    status,
    checkedHeadSha: current.piece.headSha,
    checks: input.checks && typeof input.checks === "object" ? clone(input.checks) : {},
    evidenceIds: Array.isArray(input.evidenceIds) ? input.evidenceIds.map(String) : [],
    checkedAt: requiredString(input.checkedAt, "Piece QC checkedAt"),
  };
  next.factoryStage = "PIECE_QC";
  next.gateHandoff = null;
  next.audit.push({ at: now(), event: "PIECE_QC_RECORDED", status: String(input.status || "") });
  return next;
}

function recordGateHandoffState(current, input = {}) {
  if (current.pieceQc?.status !== "pass") throw new Error("passed Piece QC is required before Ready Gate");
  if (!current.piece || current.pieceQc.checkedHeadSha !== current.piece.headSha) {
    throw new Error("Ready Gate requires Piece QC for the active Piece head");
  }
  const expected = current.pieceQc.evidenceIds;
  const received = Array.isArray(input.evidenceIds) ? input.evidenceIds.map(String) : [];
  const exactEvidence = expected.length > 0 && expected.length === received.length &&
    expected.every((id, index) => id === received[index]) &&
    expected.every((id) => current.evidence.some((item) =>
      item?.id === id && item?.scope === "piece" && item?.headSha === current.piece.headSha));
  if (!exactEvidence) throw new Error("Ready Gate requires exact Piece QC evidence");
  if (input.status !== "READY_FOR_ASSEMBLY" || input.pieceId !== current.piece.id ||
      input.workPackageId !== current.workPackage?.id || input.blueprintRef !== current.blueprint?.ref ||
      input.headSha !== current.piece.headSha) {
    throw new Error("Ready Gate handoff does not match current production truth");
  }
  const next = clone(current);
  next.gateHandoff = clone(input);
  next.factoryStage = "READY_GATE";
  next.audit.push({ at: now(), event: "READY_GATE_RECORDED", status: String(input.status || "") });
  return next;
}

function addEvidenceState(current, input = {}) {
  const next = clone(current);
  next.evidence = appendEvidence(next.evidence, input);
  const entry = next.evidence.at(-1);
  next.audit.push({ at: now(), event: "EVIDENCE_RECORDED", evidenceId: entry.id, claim: entry.claim, headSha: entry.headSha });
  return next;
}

function recordAssemblyState(current, input = {}) {
  if (current.gateHandoff?.status !== "READY_FOR_ASSEMBLY") throw new Error("Ready Gate handoff is required before Assembly");
  if (input.status !== "ASSEMBLED" || input.blueprintRef !== current.blueprint?.ref) {
    throw new Error("Assembly must match the mounted Blueprint");
  }
  const pieceIds = Array.isArray(input.pieceIds) ? input.pieceIds.map(String) : [];
  if (!pieceIds.includes(current.gateHandoff.pieceId)) throw new Error("Assembly must include the Ready Gate Piece");
  const next = clone(current);
  next.assembly = {
    ...clone(input), id: requiredString(input.id, "Assembly id"),
    repository: requiredString(input.repository, "Assembly repository"),
    integrationBranch: requiredString(input.integrationBranch, "Assembly integrationBranch"),
    integrationHeadSha: requiredString(input.integrationHeadSha, "Assembly integrationHeadSha"),
    pieceIds,
    sourceHeads: Array.isArray(input.sourceHeads) ? input.sourceHeads.map(String) : [],
  };
  next.factoryStage = "ASSEMBLY";
  next.assemblyQc = null;
  next.mergeGate = null;
  next.buildArtifact = null;
  next.productQc = null;
  next.verificationScan = null;
  next.closeout = null;
  next.lessons = [];
  next.audit.push({ at: now(), event: "ASSEMBLY_RECORDED", assemblyId: next.assembly.id, headSha: next.assembly.integrationHeadSha });
  return next;
}

function recordAssemblyQcState(current, input = {}) {
  if (!current.assembly) throw new Error("Assembly is required before Assembly QC");
  if (!["pass", "fail"].includes(input.status) || input.checkedHeadSha !== current.assembly.integrationHeadSha) {
    throw new Error("Assembly QC must match the current Assembly head");
  }
  const evidenceIds = Array.isArray(input.evidenceIds) ? input.evidenceIds.map(String) : [];
  if (input.status === "pass" && (!evidenceIds.length || evidenceIds.some(id => !current.evidence.some(item =>
    item?.id === id && item?.scope === "assembly" && item?.headSha === current.assembly.integrationHeadSha)))) {
    throw new Error("Assembly QC pass requires exact-head evidence");
  }
  const next = clone(current);
  next.assemblyQc = clone(input);
  next.factoryStage = "ASSEMBLY_QC";
  next.mergeGate = null;
  next.buildArtifact = null;
  next.productQc = null;
  next.verificationScan = null;
  next.closeout = null;
  next.lessons = [];
  next.audit.push({ at: now(), event: "ASSEMBLY_QC_RECORDED", status: input.status, headSha: input.checkedHeadSha });
  return next;
}

function recordMergeGateState(current, input = {}) {
  if (current.assemblyQc?.status !== "pass" || current.assemblyQc.checkedHeadSha !== current.assembly?.integrationHeadSha) {
    throw new Error("passed Assembly QC for the current head is required before Merge Gate");
  }
  if (input.status !== "MERGED_VERIFIED" || input.assemblyId !== current.assembly?.id || input.sourceHeadSha !== current.assembly?.integrationHeadSha) {
    throw new Error("Merge Gate must match the accepted Assembly");
  }
  const pullRequest = input.pullRequest || {};
  const ci = input.ci || {};
  const merge = input.merge || {};
  const verification = input.postMergeVerification || {};
  const assemblyHead = current.assembly.integrationHeadSha;
  const prNumber = Number(pullRequest.number || 0);
  const prHead = requiredString(pullRequest.headSha, "Merge Gate pull request head");
  const ciHead = requiredString(ci.headSha, "Merge Gate CI head");
  const mergeHead = requiredString(merge.headSha, "Merge Gate merge head");
  const mergeSha = requiredString(merge.mergeSha, "Merge Gate merge SHA");
  const mainSha = requiredString(verification.mainSha, "Merge Gate main SHA");
  if (!prNumber || prHead !== assemblyHead || ci.status !== "success" || ciHead !== prHead ||
      mergeHead !== prHead || Number(merge.pullRequestNumber || 0) !== prNumber ||
      verification.status !== "pass" || mainSha !== mergeSha || !String(verification.checkedAt || "").trim()) {
    throw new Error("Merge Gate requires exact PR CI merge and post-merge verification truth");
  }
  const next = clone(current);
  next.pullRequest = clone(pullRequest);
  next.ci = clone(ci);
  next.merge = clone(merge);
  next.mergeGate = {
    status: "MERGED_VERIFIED",
    assemblyId: current.assembly.id,
    sourceHeadSha: assemblyHead,
    pullRequestNumber: prNumber,
    pullRequestHeadSha: prHead,
    ciHeadSha: ciHead,
    mergeSha,
    mainSha,
    checkedAt: String(verification.checkedAt),
  };
  next.factoryStage = "MERGE_GATE";
  next.buildArtifact = null;
  next.productQc = null;
  next.verificationScan = null;
  next.closeout = null;
  next.lessons = [];
  next.audit.push({ at: now(), event: "MERGE_GATE_RECORDED", pullRequestNumber: prNumber, mainSha });
  return next;
}

function recordBuildArtifactState(current, input = {}) {
  if (current.assemblyQc?.status !== "pass" || current.assemblyQc.checkedHeadSha !== current.assembly?.integrationHeadSha) {
    throw new Error("passed Assembly QC for the current head is required before Build");
  }
  if (current.mergeGate?.status !== "MERGED_VERIFIED" || current.mergeGate.assemblyId !== current.assembly?.id || current.mergeGate.sourceHeadSha !== current.assembly?.integrationHeadSha) {
    throw new Error("verified Merge Gate for the current Assembly is required before Build");
  }
  if (input.status !== "BUILT" || input.assemblyId !== current.assembly.id || input.sourceHeadSha !== current.mergeGate.mainSha || input.blueprintRef !== current.blueprint?.ref) {
    throw new Error("Build Artifact must match the verified Merge Gate and mounted Blueprint");
  }
  const next = clone(current);
  next.buildArtifact = {
    ...clone(input), id: requiredString(input.id, "Artifact id"), kind: requiredString(input.kind, "Artifact kind"),
    assemblyHeadSha: current.assembly.integrationHeadSha,
    digest: requiredString(input.digest, "Artifact digest"), location: requiredString(input.location, "Artifact location"),
    builtAt: requiredString(input.builtAt, "Artifact builtAt"),
  };
  next.factoryStage = "BUILD";
  next.productQc = null;
  next.audit.push({ at: now(), event: "BUILD_ARTIFACT_RECORDED", artifactId: next.buildArtifact.id, digest: next.buildArtifact.digest });
  return next;
}

function recordProductQcState(current, input = {}) {
  if (!current.buildArtifact || input.artifactId !== current.buildArtifact.id || input.artifactDigest !== current.buildArtifact.digest) {
    throw new Error("Product QC must match the current Artifact digest");
  }
  if (!["pass", "fail"].includes(input.status)) throw new Error("Product QC status must be pass or fail");
  const evidenceIds = Array.isArray(input.evidenceIds) ? input.evidenceIds.map(String) : [];
  if (input.status === "pass" && (!evidenceIds.length || evidenceIds.some(id => !current.evidence.some(item => item?.id === id && item?.scope === "artifact" && item?.value?.digest === current.buildArtifact.digest)))) {
    throw new Error("Product QC pass requires exact-digest evidence");
  }
  const next = clone(current);
  next.productQc = clone(input);
  next.factoryStage = input.status === "pass" ? "PRODUCT_VERIFIED" : "PRODUCT_QC";
  next.verificationScan = null;
  next.closeout = null;
  next.lessons = [];
  next.audit.push({ at: now(), event: "PRODUCT_QC_RECORDED", status: input.status, digest: input.artifactDigest });
  return next;
}

function recordVerificationScanState(current, input = {}) {
  if (!["VERIFIED_CHAIN", "FIRST_BROKEN_TRUTH"].includes(input.status)) throw new Error("unsupported verification scan status");
  if (input.status === "VERIFIED_CHAIN" && (current.factoryStage !== "PRODUCT_VERIFIED" || input.artifactId !== current.buildArtifact?.id || input.artifactDigest !== current.buildArtifact?.digest)) {
    throw new Error("verified scan must match the current PRODUCT_VERIFIED Artifact");
  }
  const next = clone(current);
  next.verificationScan = clone(input);
  next.factoryStage = input.status === "VERIFIED_CHAIN" ? "VERIFIED_CHAIN" : "RECOVERY_REQUIRED";
  next.closeout = null;
  next.lessons = [];
  next.audit.push({ at: now(), event: "VERIFICATION_SCAN_RECORDED", status: input.status, station: input.station || null });
  return next;
}

function recordCloseoutState(current, input = {}) {
  const artifact = current.buildArtifact;
  if (current.verificationScan?.status !== "VERIFIED_CHAIN" || input.status !== "CLOSEOUT_READY" || input.taskId !== current.id || input.finalArtifact?.id !== artifact?.id || input.finalArtifact?.digest !== artifact?.digest) {
    throw new Error("closeout must match the current verified chain and Artifact");
  }
  const next = clone(current);
  next.closeout = clone(input);
  next.factoryStage = "CLOSED";
  next.lessons = [];
  next.audit.push({ at: now(), event: "CLOSEOUT_RECORDED", artifactDigest: artifact.digest });
  return next;
}

function recordLessonState(current, input = {}) {
  if (current.closeout?.status !== "CLOSEOUT_READY" || input.status !== "RECORDED" || input.sourceTaskId !== current.id || input.sourceArtifactDigest !== current.buildArtifact?.digest) {
    throw new Error("lesson must match the current Artifact and closed task");
  }
  const id = requiredString(input.id, "lesson id");
  if (current.lessons.some(item => item.id === id)) throw new Error("duplicate lesson id");
  const next = clone(current);
  next.lessons.push(clone(input));
  next.factoryStage = "LEARNED";
  next.audit.push({ at: now(), event: "LESSON_RECORDED", lessonId: id });
  return next;
}

function setWorkbenchTruthState(current, input = {}) {
  const next = clone(current);
  if (Object.hasOwn(input, "mission")) next.mission = input.mission == null ? null : clone(input.mission);
  if (Object.hasOwn(input, "blueprint")) next.blueprint = input.blueprint == null ? null : clone(input.blueprint);
  if (Object.hasOwn(input, "currentPiece")) next.currentPiece = input.currentPiece == null ? null : clone(input.currentPiece);
  if (Object.hasOwn(input, "evidence")) next.evidence = Array.isArray(input.evidence) ? clone(input.evidence) : [];
  next.audit.push({ at: now(), event: "WORKBENCH_TRUTH_UPDATED" });
  return next;
}

function appendAuditState(current, event, details = {}) {
  const name = String(event || "").trim();
  if (!name) throw new Error("audit event is required");
  const next = clone(current);
  next.audit.push({ ...clone(details), at: now(), event: name });
  return next;
}

function wrap(state) {
  const snapshot = () => {
    const next = clone(state);
    next.nextAction = effectiveNextAction(next);
    return next;
  };
  const current = snapshot();
  return Object.freeze({
    ...current,
    snapshot,
    transition(nextState, evidence = {}) { return wrap(transitionState(state, nextState, evidence)); },
    appendAudit(event, details = {}) { return wrap(appendAuditState(state, event, details)); },
    setWorkbenchTruth(input = {}) { return wrap(setWorkbenchTruthState(state, input)); },
    setWorkPackage(input = {}) { return wrap(setWorkPackageState(state, input)); },
    recordProductionStep(input = {}) { return wrap(recordProductionStepState(state, input)); },
    recordPiece(input = {}) { return wrap(recordPieceState(state, input)); },
    recordPieceQc(input = {}) { return wrap(recordPieceQcState(state, input)); },
    recordGateHandoff(input = {}) { return wrap(recordGateHandoffState(state, input)); },
    addEvidence(input = {}) { return wrap(addEvidenceState(state, input)); },
    recordAssembly(input = {}) { return wrap(recordAssemblyState(state, input)); },
    recordAssemblyQc(input = {}) { return wrap(recordAssemblyQcState(state, input)); },
    recordMergeGate(input = {}) { return wrap(recordMergeGateState(state, input)); },
    recordBuildArtifact(input = {}) { return wrap(recordBuildArtifactState(state, input)); },
    recordProductQc(input = {}) { return wrap(recordProductQcState(state, input)); },
    recordVerificationScan(input = {}) { return wrap(recordVerificationScanState(state, input)); },
    recordCloseout(input = {}) { return wrap(recordCloseoutState(state, input)); },
    recordLesson(input = {}) { return wrap(recordLessonState(state, input)); },
  });
}

export function createCodeTask(initial = {}) {
  return wrap(normalizeInitial(initial));
}

export function createCodeTaskFromSnapshot(snapshot) {
  return wrap(normalizeSnapshot(snapshot));
}
