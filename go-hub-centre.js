import { createId, nowIso } from "./go-hub-utils.js";

export const CENTRE_STATES = Object.freeze({
  ARRIVED: "ARRIVED",
  WAIT: "WAIT",
  READY: "READY",
  AWAY: "AWAY",
  RETURNED: "RETURNED",
});

function required(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function snapshot(value) {
  return freeze(structuredClone(value));
}

function assertState(work, expected) {
  if (!work || work.status !== expected) {
    throw new Error(`Centre work must be ${expected}`);
  }
}

export function createCheckpoint(input = {}) {
  const checkpointId = String(input.checkpointId || createId("CENTRE")).trim();
  const workId = String(input.workId || createId("WORK")).trim();
  return snapshot({
    checkpointId: required(checkpointId, "Checkpoint ID"),
    workId: required(workId, "Work ID"),
    createdAt: String(input.createdAt || nowIso()),
    status: CENTRE_STATES.ARRIVED,
    task: null,
    requestedResult: null,
    authority: null,
    lens: null,
    handoff: null,
    returnedPayload: null,
  });
}

export function intakeTask(work, input = {}) {
  assertState(work, CENTRE_STATES.ARRIVED);
  const next = structuredClone(work);
  next.task = String(input.task || "").trim() || null;
  next.requestedResult = String(input.requestedResult || "").trim() || null;
  next.authority = String(input.authority || "").trim() || null;
  next.status = next.task && next.requestedResult && next.authority
    ? CENTRE_STATES.READY
    : CENTRE_STATES.WAIT;
  return snapshot(next);
}

export function resumeIntake(work, input = {}) {
  assertState(work, CENTRE_STATES.WAIT);
  const next = structuredClone(work);
  next.status = CENTRE_STATES.ARRIVED;
  return intakeTask(next, {
    task: input.task ?? work.task,
    requestedResult: input.requestedResult ?? work.requestedResult,
    authority: input.authority ?? work.authority,
  });
}

export function fitLens(work, input = {}) {
  assertState(work, CENTRE_STATES.READY);
  const next = structuredClone(work);
  next.lens = {
    lensId: required(input.lensId, "Lens ID"),
    lensReference: required(input.lensReference, "Lens Reference"),
    fittedView: required(input.fittedView, "Fitted View"),
  };
  return snapshot(next);
}

export function createHandoff(work, input = {}) {
  assertState(work, CENTRE_STATES.READY);
  if (!work.lens) throw new Error("fitted Lens is required before handoff");
  const destination = required(input.destination, "Destination");
  const envelope = {
    workId: work.workId,
    checkpointId: work.checkpointId,
    task: work.task,
    requestedResult: work.requestedResult,
    lensReference: work.lens.lensReference,
    destination,
    returnAddress: work.checkpointId,
  };
  const next = structuredClone(work);
  next.handoff = envelope;
  next.status = CENTRE_STATES.AWAY;
  return snapshot({ work: next, envelope });
}

export function receiveReturn(work, returned = {}) {
  assertState(work, CENTRE_STATES.AWAY);
  if (String(returned.workId || "") !== work.workId) {
    throw new Error("returned Work ID does not match");
  }
  if (String(returned.checkpointId || "") !== work.checkpointId) {
    throw new Error("returned Checkpoint ID does not match Return Address");
  }
  const next = structuredClone(work);
  next.status = CENTRE_STATES.RETURNED;
  next.returnedPayload = returned.payload === undefined
    ? null
    : structuredClone(returned.payload);
  return snapshot(next);
}

export function createTestDestinationAdapter(handler = envelope => ({ received: envelope.task })) {
  if (typeof handler !== "function") throw new Error("test destination handler is required");
  return freeze({
    accept(envelope) {
      const payload = handler(snapshot(envelope));
      return snapshot({
        workId: envelope.workId,
        checkpointId: envelope.returnAddress,
        payload,
      });
    },
  });
}

export function createCentrePassage() {
  return freeze({
    enter(input = {}) {
      return createCheckpoint(input);
    },
    review(work, input = {}) {
      if (work?.status === CENTRE_STATES.WAIT) return resumeIntake(work, input);
      return intakeTask(work, input);
    },
    fit(work, input = {}) {
      return fitLens(work, input);
    },
    leave(work, input = {}) {
      return createHandoff(work, input);
    },
    return(work, returned = {}) {
      return receiveReturn(work, returned);
    },
  });
}

export function createGoWorkLoop({ passage = createCentrePassage() } = {}) {
  return freeze({
    enter(input = {}) {
      let work = passage.enter(input);
      work = passage.review(work, input);
      if (work.status !== CENTRE_STATES.READY || !input.lens) return work;
      return passage.fit(work, input.lens);
    },
    act(work, { destination, capability } = {}) {
      assertState(work, CENTRE_STATES.READY);
      const outbound = passage.leave(work, { destination });
      if (!capability || typeof capability.accept !== "function") {
        throw new Error("Destination capability accept() is required");
      }
      const returned = capability.accept(outbound.envelope);
      return passage.return(outbound.work, returned);
    },
  });
}

export function validateCentreWork(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Centre work snapshot is required");
  }
  required(value.checkpointId, "Checkpoint ID");
  required(value.workId, "Work ID");
  required(value.createdAt, "Created At");
  if (!Object.values(CENTRE_STATES).includes(value.status)) {
    throw new Error("Centre status is invalid");
  }
  if (value.status === CENTRE_STATES.AWAY) {
    if (!value.handoff || value.handoff.workId !== value.workId ||
        value.handoff.checkpointId !== value.checkpointId ||
        value.handoff.returnAddress !== value.checkpointId) {
      throw new Error("AWAY work requires an exact Centre handoff");
    }
  }
  return snapshot(value);
}

export function createCentreSession({ persistence, initial = {}, passage = createCentrePassage() } = {}) {
  if (!persistence || typeof persistence.loadState !== "function" ||
      typeof persistence.commitState !== "function") {
    throw new TypeError("Centre persistence port is required");
  }
  return freeze({
    async load() {
      const stored = await persistence.loadState();
      return stored ? validateCentreWork(stored) : passage.enter(initial);
    },
    async save(work, commandType = "SAVE_CENTRE_WORK") {
      const proposed = validateCentreWork(work);
      return persistence.commitState({ proposed, command: { type: commandType } });
    },
  });
}

export function admitDestination(work, { destination, capability } = {}) {
  assertState(work, CENTRE_STATES.AWAY);
  const target = required(destination, "Destination");
  if (work.handoff?.destination !== target) {
    throw new Error("Destination does not match the Centre handoff");
  }
  if (!capability || typeof capability !== "object") {
    throw new Error("Destination capability is required");
  }
  return Object.freeze({
    workId: work.workId,
    checkpointId: work.checkpointId,
    returnAddress: work.handoff.returnAddress,
    destination: target,
    envelope: snapshot(work.handoff),
    capability,
  });
}

export function createReturnPacket(access, payload = null) {
  if (!access || access.checkpointId !== access.returnAddress) {
    throw new Error("Destination access has no valid Return Address");
  }
  return snapshot({ workId: access.workId, checkpointId: access.returnAddress, payload });
}
