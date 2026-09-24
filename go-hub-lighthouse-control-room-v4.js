export const LIGHTHOUSE_ROOM_SECTIONS = Object.freeze({
  REAL_BOARD: "REAL_BOARD",
  APP_STATUS: "APP_STATUS",
  DATA_DROP: "DATA_DROP",
  REPORT_INBOX: "REPORT_INBOX",
  CONTROL: "CONTROL",
  MAINTENANCE: "MAINTENANCE",
});

function clean(value) { return String(value == null ? "" : value).trim(); }

export function assertLighthouseRoomAccess(work, actor) {
  if (!work || work.status !== "ON PROCESS") throw new Error("LIGHTHOUSE_WORK_NOT_ACTIVE");
  if (clean(work.holder) !== clean(actor)) throw new Error("LIGHTHOUSE_HOLDER_REQUIRED");
  const pass = work.pass;
  if (!pass || pass.state !== "ACTIVE") throw new Error("LIGHTHOUSE_ACTIVE_PASS_REQUIRED");
  const allowed = Array.isArray(pass.allowedDestinations) ? pass.allowedDestinations.map(clean) : [];
  if (!allowed.includes("lighthouse") && !allowed.includes("ALL_GO_HUB_OWNED_AREAS")) throw new Error("LIGHTHOUSE_DESTINATION_NOT_AUTHORIZED");
  return true;
}

export function createLighthouseControlRoom({ work, actor, status = {}, reports = [], traces = [] } = {}) {
  assertLighthouseRoomAccess(work, actor);
  return Object.freeze({
    room: "LIGHTHOUSE_CONTROL_ROOM",
    workId: clean(work.workId),
    holder: clean(actor),
    sections: LIGHTHOUSE_ROOM_SECTIONS,
    realBoard: Object.freeze({
      connection: clean(status.connection) || "UNKNOWN",
      appRevision: clean(status.appRevision) || null,
      lastSeenAt: clean(status.lastSeenAt) || null,
      pendingCommands: Number.isSafeInteger(status.pendingCommands) ? status.pendingCommands : null,
      lastReportAt: clean(status.lastReportAt) || null,
    }),
    dataDrop: Object.freeze({ mode: "EXPLICIT_SEND_TO_APP", destination: "lighthouse" }),
    reportInbox: Object.freeze({ mode: "APP_RETURN_REPORTS", items: Object.freeze([...reports]) }),
    maintenance: Object.freeze({
      mode: "READ_PREFLIGHT_SAFE_TEST",
      autoRepair: false,
      traces: Object.freeze([...traces]),
    }),
    mutationRule: "RETURN_CENTRE_UPDATE_SAME_WORK_REQUEST_DESTINATION_THEN_REENTER",
  });
}

export function requireCentreReturnForLighthouseMutation({ requestedDestination, currentPass } = {}) {
  const requested = clean(requestedDestination);
  const allowed = Array.isArray(currentPass?.allowedDestinations) ? currentPass.allowedDestinations.map(clean) : [];
  if (!requested) throw new Error("LIGHTHOUSE_MUTATION_DESTINATION_REQUIRED");
  if (!allowed.includes(requested) && !allowed.includes("ALL_GO_HUB_OWNED_AREAS")) {
    return Object.freeze({
      allowed: false,
      action: "RETURN_CENTRE",
      instruction: "Update the same Work Form, ask Heimdall to open the required destination, then re-enter.",
    });
  }
  return Object.freeze({ allowed: true, action: "USE_ALREADY_AUTHORIZED_DESTINATION" });
}
