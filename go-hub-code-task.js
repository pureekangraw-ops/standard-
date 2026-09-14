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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function now() {
  return new Date().toISOString();
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
  if (!NEXT_ACTION[state.state] || state.nextAction !== NEXT_ACTION[state.state]) {
    throw new Error("task snapshot state is invalid");
  }
  if (!Array.isArray(state.audit)) throw new Error("task snapshot audit is required");
  return state;
}

function appendAuditState(current, event, details = {}) {
  const name = String(event || "").trim();
  if (!name) throw new Error("audit event is required");
  const next = clone(current);
  next.audit.push({ ...clone(details), at: now(), event: name });
  return next;
}

function wrap(state) {
  const snapshot = () => clone(state);
  return Object.freeze({
    ...snapshot(),
    snapshot,
    transition(nextState, evidence = {}) {
      return wrap(transitionState(state, nextState, evidence));
    },
    appendAudit(event, details = {}) {
      return wrap(appendAuditState(state, event, details));
    },
  });
}

export function createCodeTask(initial = {}) {
  return wrap(normalizeInitial(initial));
}

export function createCodeTaskFromSnapshot(snapshot) {
  return wrap(normalizeSnapshot(snapshot));
}
