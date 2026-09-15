const SLOT_NAMES = Object.freeze(["assembly", "merge"]);

function required(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function lane() {
  return { active: null, queue: [] };
}

function ensureRepository(state, repository) {
  if (!state.repositories[repository]) {
    state.repositories[repository] = { assembly: lane(), merge: lane() };
  }
  return state.repositories[repository];
}

function assertSlot(value) {
  const slot = required(value, "slot");
  if (!SLOT_NAMES.includes(slot)) throw new Error(`unsupported slot: ${slot}`);
  return slot;
}

function findActiveByGo(state, goId) {
  for (const [repository, lanes] of Object.entries(state.repositories || {})) {
    for (const slot of SLOT_NAMES) {
      if (lanes?.[slot]?.active?.goId === goId) {
        return { repository, slot, job: lanes[slot].active };
      }
    }
  }
  return null;
}

export function createHephaestusState() {
  return Object.freeze({ version: 1, repositories: Object.freeze({}) });
}

export function screenFactoryIntent({ kind, blueprint = null } = {}) {
  const workKind = required(kind, "kind");
  if (workKind === "create" && blueprint?.approved !== true) {
    return Object.freeze({
      decision: "RETURN_FOR_PLAN",
      destination: "optician",
      reason: "APPROVED_BLUEPRINT_REQUIRED",
    });
  }
  return Object.freeze({ decision: "PROCEED", reason: "FACTORY_WORK_ALLOWED" });
}

export function evaluateQueueRisk({
  conflict = false,
  overlappingPaths = [],
  dependencyRisks = [],
  staleBase = false,
} = {}) {
  const reasons = [];
  if (conflict) reasons.push("CONFLICT");
  if (Array.isArray(dependencyRisks) && dependencyRisks.length) reasons.push("DEPENDENCY_RISK");
  if (reasons.length) return Object.freeze({ status: "BLOCKED", reasons: Object.freeze(reasons) });
  if (Array.isArray(overlappingPaths) && overlappingPaths.length) reasons.push("PATH_OVERLAP");
  if (staleBase) reasons.push("STALE_PROJECTION");
  return Object.freeze({
    status: reasons.length ? "RECHECK" : "SAFE",
    reasons: Object.freeze(reasons),
  });
}

function wait(reason) {
  return Object.freeze({ decision: "WAIT", reasons: Object.freeze([reason]) });
}

export function evaluateFactoryAdmission(input = {}) {
  const slot = assertSlot(input.slot);
  if (slot === "assembly") {
    const readyGate = input.readyGate;
    const pieceHead = String(input.piece?.headSha || "");
    if (readyGate?.status !== "READY_FOR_ASSEMBLY" || !pieceHead) return wait("READY_GATE_REQUIRED");
    if (String(readyGate.headSha || "") !== pieceHead) return wait("READY_GATE_STALE_HEAD");
    return Object.freeze({ decision: "ADMIT", reasons: Object.freeze([]) });
  }

  const assemblyHead = String(input.assembly?.integrationHeadSha || "");
  if (input.assembly?.status !== "ASSEMBLED" || !assemblyHead) return wait("ASSEMBLY_REQUIRED");
  if (input.assemblyQc?.status !== "pass") return wait("ASSEMBLY_QC_REQUIRED");
  if (String(input.assemblyQc.checkedHeadSha || "") !== assemblyHead) return wait("ASSEMBLY_QC_STALE_HEAD");

  const prHead = String(input.pullRequest?.headSha || "");
  if (!input.pullRequest?.number || !prHead) return wait("PULL_REQUEST_REQUIRED");
  if (input.ci?.status !== "success") return wait("CI_GREEN_REQUIRED");
  if (String(input.ci.headSha || "") !== prHead) return wait("CI_STALE_HEAD");

  const risk = input.risk || { status: "RECHECK", reasons: ["QUEUE_RISK_REQUIRED"] };
  const riskReasons = Array.isArray(risk.reasons) ? risk.reasons.map(String) : [];
  if (risk.status === "BLOCKED") {
    return Object.freeze({ decision: "BLOCK", reasons: Object.freeze(riskReasons.length ? riskReasons : ["QUEUE_RISK_BLOCKED"]) });
  }
  if (risk.status !== "SAFE") {
    return Object.freeze({ decision: "WAIT", reasons: Object.freeze(riskReasons.length ? riskReasons : ["QUEUE_RISK_RECHECK"]) });
  }
  return Object.freeze({ decision: "ADMIT", reasons: Object.freeze([]) });
}

export function requestFactorySlot(current, request = {}) {
  const state = clone(current || createHephaestusState());
  const repository = required(request.repository, "repository");
  const slot = assertSlot(request.slot);
  const goId = required(request.goId, "goId");
  const jobId = required(request.jobId, "jobId");
  const admission = request.admission || { decision: "WAIT", reasons: ["ADMISSION_REQUIRED"] };

  if (admission.decision !== "ADMIT") {
    return Object.freeze({
      state: Object.freeze(state),
      outcome: Object.freeze({
        status: admission.decision === "BLOCK" ? "BLOCKED" : "WAIT",
        reason: admission.reasons?.[0] || "ADMISSION_REQUIRED",
      }),
    });
  }

  const active = findActiveByGo(state, goId);
  if (active && !(active.repository === repository && active.slot === slot && active.job.jobId === jobId)) {
    return Object.freeze({
      state: Object.freeze(state),
      outcome: Object.freeze({ status: "WAIT", reason: "GO_ALREADY_ACTIVE" }),
    });
  }

  const repositoryState = ensureRepository(state, repository);
  const target = repositoryState[slot];

  if (target.active?.jobId === jobId && target.active?.goId === goId) {
    return Object.freeze({ state: Object.freeze(state), outcome: Object.freeze({ status: "ACTIVE" }) });
  }

  const queuedIndex = target.queue.findIndex(item => item.jobId === jobId && item.goId === goId);
  if (queuedIndex >= 0) {
    return Object.freeze({
      state: Object.freeze(state),
      outcome: Object.freeze({ status: "QUEUED", position: queuedIndex + 1 }),
    });
  }

  const job = { repository, slot, goId, jobId, status: target.active ? "QUEUED" : "ACTIVE" };
  if (!target.active) {
    target.active = job;
    return Object.freeze({ state: Object.freeze(state), outcome: Object.freeze({ status: "ACTIVE" }) });
  }

  target.queue.push(job);
  return Object.freeze({
    state: Object.freeze(state),
    outcome: Object.freeze({ status: "QUEUED", position: target.queue.length }),
  });
}
