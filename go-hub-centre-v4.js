import { createId, nowIso } from "./go-hub-utils.js";

export const WORK_STATUS = Object.freeze({
  OPEN: "OPEN",
  ON_PROCESS: "ON PROCESS",
  WAIT_CONFIRM: "WAIT CONFIRM",
  COMPLETE: "COMPLETE",
  CANCEL: "CANCEL",
});

export const PASS_KIND = Object.freeze({
  WORK: "WORK",
  READ: "READ",
  MAINTENANCE: "MAINTENANCE",
});

const STATUS_VALUES = new Set(Object.values(WORK_STATUS));
const PASS_VALUES = new Set(Object.values(PASS_KIND));

function text(value) { return String(value ?? "").trim(); }
function required(value, label) {
  const valueText = text(value);
  if (!valueText) throw new Error(`${label} is required`);
  return valueText;
}
function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function snapshot(value) { return freeze(structuredClone(value)); }

export function createWorkRecord(input = {}) {
  const now = text(input.createdAt) || nowIso();
  return snapshot({
    workId: text(input.workId) || createId("WORK"),
    name: required(input.name || input.command, "Work name"),
    command: required(input.command, "Command"),
    expectedResult: required(input.expectedResult, "Expected Result"),
    requestedDestinations: unique(input.requestedDestinations),
    status: WORK_STATUS.OPEN,
    holder: null,
    pass: null,
    createdAt: now,
    lastUpdated: now,
    readback: null,
  });
}

export function claimWork(work, { actor, at = nowIso() } = {}) {
  validateWorkRecord(work);
  if (work.status !== WORK_STATUS.OPEN) throw new Error("Work is not OPEN");
  const next = structuredClone(work);
  next.status = WORK_STATUS.ON_PROCESS;
  next.holder = required(actor, "Holder");
  next.lastUpdated = at;
  return snapshot(next);
}

export function openWorkPass(work, { kind = PASS_KIND.WORK, destinations, actor, at = nowIso() } = {}) {
  validateWorkRecord(work);
  if (work.status !== WORK_STATUS.ON_PROCESS || !work.holder) {
    throw new Error("ON PROCESS Work with holder is required before Pass");
  }
  const passKind = text(kind).toUpperCase();
  if (!PASS_VALUES.has(passKind)) throw new Error("Pass kind is invalid");
  const opener = required(actor || work.holder, "Pass actor");
  if (opener !== work.holder) throw new Error("Only current holder can open Pass");
  if (passKind === PASS_KIND.MAINTENANCE && opener.toUpperCase() !== "GO") throw new Error("Maintenance Pass is GO-only");
  const requested = unique(destinations ?? work.requestedDestinations);
  const allowedDestinations = passKind === PASS_KIND.MAINTENANCE
    ? Object.freeze(["ALL_GO_HUB_OWNED_AREAS"])
    : Object.freeze(requested);
  if (!allowedDestinations.length) throw new Error("Pass destinations are required");
  const next = structuredClone(work);
  next.pass = {
    kind: passKind,
    state: "ACTIVE",
    openedAt: at,
    openedBy: "heimdall",
    allowedDestinations,
  };
  next.lastUpdated = at;
  return snapshot(next);
}

export function updateWorkDestinations(work, { destinations, at = nowIso() } = {}) {
  validateWorkRecord(work);
  if (work.status !== WORK_STATUS.OPEN || work.holder || work.pass?.state === "ACTIVE") {
    throw new Error("Return Centre and OPEN the Work before changing destinations");
  }
  const next = structuredClone(work);
  next.requestedDestinations = unique(destinations);
  next.lastUpdated = at;
  return snapshot(next);
}

export function waitForConfirmation(work, { reason, at = nowIso() } = {}) {
  validateWorkRecord(work);
  if (work.status !== WORK_STATUS.ON_PROCESS) throw new Error("Only ON PROCESS Work can wait");
  const next = structuredClone(work);
  next.status = WORK_STATUS.WAIT_CONFIRM;
  next.readback = { type: "WAIT", reason: required(reason, "Wait reason") };
  next.lastUpdated = at;
  return snapshot(next);
}

export function resumeWork(work, { actor, at = nowIso() } = {}) {
  validateWorkRecord(work);
  if (work.status !== WORK_STATUS.WAIT_CONFIRM) throw new Error("Work is not WAIT CONFIRM");
  const holder = required(actor, "Holder");
  if (work.holder && work.holder !== holder) throw new Error("Work holder mismatch");
  const next = structuredClone(work);
  next.status = WORK_STATUS.ON_PROCESS;
  next.holder = holder;
  next.readback = null;
  next.lastUpdated = at;
  return snapshot(next);
}

export function returnWork(work, { actor, status = WORK_STATUS.COMPLETE, result, evidence = [], at = nowIso() } = {}) {
  validateWorkRecord(work);
  if (![WORK_STATUS.ON_PROCESS, WORK_STATUS.WAIT_CONFIRM].includes(work.status)) {
    throw new Error("Active Work is required for Return");
  }
  const holder = required(actor, "Holder");
  if (holder !== work.holder) throw new Error("Only current holder can update Work on Return");
  const nextStatus = text(status).toUpperCase();
  if (![WORK_STATUS.COMPLETE, WORK_STATUS.CANCEL, WORK_STATUS.OPEN].includes(nextStatus)) {
    throw new Error("Return status must be COMPLETE, CANCEL, or OPEN");
  }
  const next = structuredClone(work);
  next.status = nextStatus;
  next.readback = {
    actor: holder,
    result: result ?? null,
    evidence: Array.isArray(evidence) ? structuredClone(evidence) : [],
    returnedAt: at,
  };
  if (next.pass) next.pass = { ...next.pass, state: "CLOSED", closedAt: at };
  next.holder = null;
  next.lastUpdated = at;
  return snapshot(next);
}

export function boardView(works = []) {
  return Object.freeze(works.map(work => {
    validateWorkRecord(work);
    return Object.freeze({
      workId: work.workId,
      name: work.name,
      status: work.status,
      holder: work.holder,
      lastUpdated: work.lastUpdated,
      requestedDestinations: work.requestedDestinations,
      pass: work.pass ? {
        kind: work.pass.kind,
        state: work.pass.state,
        allowedDestinations: work.pass.allowedDestinations,
      } : null,
    });
  }));
}

export function validateWorkRecord(work) {
  if (!work || typeof work !== "object" || Array.isArray(work)) throw new Error("Work record is required");
  required(work.workId, "Work ID");
  required(work.name, "Work name");
  required(work.command, "Command");
  required(work.expectedResult, "Expected Result");
  if (!STATUS_VALUES.has(work.status)) throw new Error("Work status is invalid");
  if (work.status === WORK_STATUS.ON_PROCESS && !text(work.holder)) throw new Error("ON PROCESS Work requires holder");
  if (work.pass?.state === "ACTIVE" && (work.status !== WORK_STATUS.ON_PROCESS || !text(work.holder))) {
    throw new Error("Active Pass requires ON PROCESS Work with holder");
  }
  return snapshot(work);
}

export function createCentreWorkSystem() {
  return freeze({
    create: createWorkRecord,
    claim: claimWork,
    openPass: openWorkPass,
    updateDestinations: updateWorkDestinations,
    wait: waitForConfirmation,
    resume: resumeWork,
    return: returnWork,
    board: boardView,
  });
}
