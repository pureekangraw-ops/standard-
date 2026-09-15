const SLOT_NAMES = Object.freeze(["assembly", "merge"]);

function required(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertSlot(value) {
  const slot = required(value, "slot");
  if (!SLOT_NAMES.includes(slot)) throw new Error(`unsupported slot: ${slot}`);
  return slot;
}

function findActiveByGo(state, goId) {
  for (const lanes of Object.values(state.repositories || {})) {
    for (const slot of SLOT_NAMES) {
      if (lanes?.[slot]?.active?.goId === goId) return true;
    }
  }
  return false;
}

export function releaseFactorySlot(current, input = {}) {
  const state = clone(current || { version: 1, repositories: {} });
  const repository = required(input.repository, "repository");
  const slot = assertSlot(input.slot);
  const goId = required(input.goId, "goId");
  const jobId = required(input.jobId, "jobId");
  const target = state.repositories?.[repository]?.[slot];
  if (!target?.active || target.active.goId !== goId || target.active.jobId !== jobId) {
    throw new Error("active slot owner does not match release");
  }
  target.active = null;
  const next = target.queue?.[0] || null;
  if (next) {
    next.status = "NEEDS_RECHECK";
    next.risk = { status: "RECHECK", reasons: ["QUEUE_ADVANCED"] };
  }
  return Object.freeze({
    state: Object.freeze(state),
    outcome: Object.freeze({
      status: "RELEASED",
      promotedJobId: next?.jobId || null,
      nextAction: next ? "RECHECK_QUEUE_HEAD" : "SLOT_IDLE",
    }),
  });
}

export function admitQueuedFactorySlot(current, input = {}) {
  const state = clone(current || { version: 1, repositories: {} });
  const repository = required(input.repository, "repository");
  const slot = assertSlot(input.slot);
  const goId = required(input.goId, "goId");
  const jobId = required(input.jobId, "jobId");
  const admission = input.admission || { decision: "WAIT", reasons: ["ADMISSION_REQUIRED"] };
  if (admission.decision !== "ADMIT") {
    return Object.freeze({ state: Object.freeze(state), outcome: Object.freeze({ status: admission.decision === "BLOCK" ? "BLOCKED" : "WAIT", reason: admission.reasons?.[0] || "ADMISSION_REQUIRED" }) });
  }
  if (findActiveByGo(state, goId)) {
    return Object.freeze({ state: Object.freeze(state), outcome: Object.freeze({ status: "WAIT", reason: "GO_ALREADY_ACTIVE" }) });
  }
  const target = state.repositories?.[repository]?.[slot];
  if (!target) throw new Error("queue lane not found");
  if (target.active) return Object.freeze({ state: Object.freeze(state), outcome: Object.freeze({ status: "WAIT", reason: "SLOT_OCCUPIED" }) });
  const head = target.queue?.[0];
  if (!head || head.goId !== goId || head.jobId !== jobId) {
    return Object.freeze({ state: Object.freeze(state), outcome: Object.freeze({ status: "WAIT", reason: "NOT_QUEUE_HEAD" }) });
  }
  const job = target.queue.shift();
  job.status = "ACTIVE";
  target.active = job;
  return Object.freeze({ state: Object.freeze(state), outcome: Object.freeze({ status: "ACTIVE", rechecked: true }) });
}
