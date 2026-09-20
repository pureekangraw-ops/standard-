const FLOW_STATES = Object.freeze({
  RECEIVED: "RECEIVED",
  REPO_FOUND: "REPO_FOUND",
  PLANNING: "PLANNING",
  PLAN_LOCKED: "PLAN_LOCKED",
  EXECUTING: "EXECUTING",
  VERIFIED: "VERIFIED",
  DELIVERED: "DELIVERED",
  SENT: "SENT",
  READ_ONLY: "READ_ONLY",
  BIG_DIRECT: "BIG_DIRECT",
});

const PROCESS_TYPES = Object.freeze({
  CENTRE_ROUTE: "CENTRE_ROUTE",
  FIND_REPO: "FIND_REPO",
  PLAN: "PLAN",
  EXECUTE: "EXECUTE",
  VERIFY: "VERIFY",
  DELIVER: "DELIVER",
  READ: "READ",
  DIRECT: "DIRECT",
});

const PLAN_FIELDS = Object.freeze([
  "scope", "reality", "repository", "branch", "architecture",
  "dependencies", "constraints", "existingImplementation",
  "changes", "impact", "steps", "testStrategy", "buildStrategy",
  "acceptanceCriteria", "deliverables",
]);

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function text(value, label) {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(label + " is required");
  return result;
}

function list(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(label + " must be a non-empty array");
  }
  return clone(value);
}

function identity(input) {
  return {
    packageId: text(input.packageId, "packageId"),
    workId: text(input.workId, "workId"),
  };
}

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function packageState(input, processType, result, nextState) {
  const id = identity(input);
  return freeze({
    ...clone(input),
    ...id,
    currentState: nextState,
    process: Object.freeze({
      type: text(processType, "processType"),
      result: clone(result),
      at: new Date().toISOString(),
    }),
  });
}

export function createWorkPackage(input = {}) {
  const id = identity(input);
  return freeze({
    packageId: id.packageId,
    workId: id.workId,
    source: text(input.source, "source"),
    destination: text(input.destination, "destination"),
    payload: clone(input.payload ?? {}),
    currentState: String(input.currentState || FLOW_STATES.RECEIVED),
    process: null,
    result: null,
    nextState: null,
    evidence: clone(input.evidence ?? null),
  });
}

export function receivePackage(input = {}, expectedWorkId = null) {
  const pkg = createWorkPackage(input);
  if (expectedWorkId != null && pkg.workId !== text(expectedWorkId, "expected workId")) {
    throw new Error("WORK_ID_MISMATCH");
  }
  return pkg;
}

export function routeCentre(pkg, result = {}) {
  const next = text(result.nextDestination ?? pkg.destination, "nextDestination");
  return packageState(pkg, PROCESS_TYPES.CENTRE_ROUTE, { ...clone(result), destination: next }, FLOW_STATES.RECEIVED);
}

export function findRepository(pkg, result = {}) {
  if (!pkg || pkg.currentState !== FLOW_STATES.RECEIVED) throw new Error("FIND_REPO_REQUIRES_RECEIVED");
  const repository = text(result.repository, "repository");
  return packageState(pkg, PROCESS_TYPES.FIND_REPO, { ...clone(result), repository }, FLOW_STATES.REPO_FOUND);
}

export function lockPlan(pkg, plan = {}) {
  if (!pkg || ![FLOW_STATES.REPO_FOUND, FLOW_STATES.PLANNING].includes(pkg.currentState)) {
    throw new Error("PLAN_REQUIRES_REPO");
  }
  for (const field of PLAN_FIELDS) {
    if (field === "dependencies" || field === "constraints" || field === "steps" ||
        field === "testStrategy" || field === "buildStrategy" ||
        field === "acceptanceCriteria" || field === "deliverables") list(plan[field], "plan." + field);
    else text(plan[field], "plan." + field);
  }
  const lockedPlan = Object.freeze({
    ...clone(plan),
    lockedAt: new Date().toISOString(),
  });
  return packageState(pkg, PROCESS_TYPES.PLAN, { plan: lockedPlan }, FLOW_STATES.PLAN_LOCKED);
}

export function executePlan(pkg, result = {}) {
  if (!pkg || pkg.currentState !== FLOW_STATES.PLAN_LOCKED) throw new Error("EXECUTE_REQUIRES_PLAN_LOCK");
  return packageState(pkg, PROCESS_TYPES.EXECUTE, result, FLOW_STATES.EXECUTING);
}

export function verifyPlan(pkg, verification = {}) {
  if (!pkg || pkg.currentState !== FLOW_STATES.EXECUTING) throw new Error("VERIFY_REQUIRES_EXECUTION");
  if (verification.planMatched !== true) throw new Error("PLAN_MISMATCH");
  if (verification.testsPassed !== true) throw new Error("TESTS_NOT_PASSED");
  if (verification.buildPassed !== true) throw new Error("BUILD_NOT_PASSED");
  const acceptance = list(verification.acceptanceCriteria, "acceptanceCriteria");
  const deliverables = list(verification.deliverables, "deliverables");
  return packageState(pkg, PROCESS_TYPES.VERIFY, {
    ...clone(verification), acceptanceCriteria: acceptance, deliverables,
  }, FLOW_STATES.VERIFIED);
}

export function deliverPackage(pkg, result = {}) {
  if (!pkg || pkg.currentState !== FLOW_STATES.VERIFIED) throw new Error("DELIVER_REQUIRES_VERIFY");
  return packageState(pkg, PROCESS_TYPES.DELIVER, result, FLOW_STATES.DELIVERED);
}

export function sendPackage(pkg, destination = null) {
  if (!pkg || ![FLOW_STATES.DELIVERED, FLOW_STATES.READ_ONLY, FLOW_STATES.BIG_DIRECT].includes(pkg.currentState)) {
    throw new Error("SEND_REQUIRES_DELIVERY");
  }
  const next = text(destination ?? pkg.destination, "destination");
  return freeze({
    packageId: pkg.packageId,
    workId: pkg.workId,
    source: pkg.source,
    destination: next,
    payload: clone(pkg.payload),
    currentState: FLOW_STATES.SENT,
    process: clone(pkg.process),
    result: clone(pkg.result),
    nextState: FLOW_STATES.SENT,
    evidence: clone(pkg.evidence),
  });
}

export function readOnly(input = {}) {
  const pkg = receivePackage({ ...input, currentState: FLOW_STATES.READ_ONLY });
  return sendPackage(pkg, input.destination);
}

export function bigDirect(input = {}) {
  const pkg = receivePackage({ ...input, currentState: FLOW_STATES.BIG_DIRECT });
  return sendPackage(pkg, input.destination);
}

export { FLOW_STATES, PROCESS_TYPES, PLAN_FIELDS };
