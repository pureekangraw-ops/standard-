export const WORK_INTERRUPTION = Object.freeze({
  ABANDON: "ABANDON",
  WITHDRAW: "WITHDRAW",
  CANCEL: "CANCEL",
  BLOCKED: "BLOCKED",
  VERIFY_FAILED: "VERIFY_FAILED",
  RECOVERY_REQUIRED: "RECOVERY_REQUIRED",
  ROLLED_BACK: "ROLLED_BACK",
  CANCELLED_BY_OWNER: "CANCELLED_BY_OWNER",
});

const CANCELLATION_REQUESTS = new Set([
  WORK_INTERRUPTION.ABANDON,
  WORK_INTERRUPTION.WITHDRAW,
  WORK_INTERRUPTION.CANCEL,
]);

function normalizeKind(value) {
  const kind = String(value || "").trim().toUpperCase();
  if (kind === "STOP") return WORK_INTERRUPTION.BLOCKED;
  if (!Object.values(WORK_INTERRUPTION).includes(kind)) throw new Error("unsupported work interruption");
  return kind;
}

export function resolveWorkInterruption({
  requested,
  realityExists = false,
  merged = false,
  deployed = false,
} = {}) {
  const kind = normalizeKind(requested);
  const hasReality = realityExists === true || merged === true || deployed === true;

  if (CANCELLATION_REQUESTS.has(kind) && hasReality) {
    return Object.freeze({
      requested: kind,
      state: WORK_INTERRUPTION.RECOVERY_REQUIRED,
      mode: "RECOVERY",
      cancellable: false,
      terminal: false,
      reason: "REALITY_ALREADY_EXISTS",
      actions: Object.freeze(["verify", "repair", "rollback"]),
    });
  }

  if (kind === WORK_INTERRUPTION.VERIFY_FAILED || kind === WORK_INTERRUPTION.RECOVERY_REQUIRED) {
    return Object.freeze({
      requested: kind,
      state: WORK_INTERRUPTION.RECOVERY_REQUIRED,
      mode: "RECOVERY",
      cancellable: false,
      terminal: false,
      reason: kind,
      actions: Object.freeze(["verify", "repair", "rollback"]),
    });
  }

  if (kind === WORK_INTERRUPTION.BLOCKED) {
    return Object.freeze({
      requested: kind,
      state: WORK_INTERRUPTION.BLOCKED,
      mode: "HOLD",
      cancellable: false,
      terminal: false,
      reason: "BLOCKED",
      actions: Object.freeze(["inspect", "resolve-blocker"]),
    });
  }

  if (kind === WORK_INTERRUPTION.ROLLED_BACK) {
    return Object.freeze({
      requested: kind,
      state: WORK_INTERRUPTION.ROLLED_BACK,
      mode: "RETURN",
      cancellable: false,
      terminal: true,
      reason: "ROLLED_BACK",
      actions: Object.freeze(["return"]),
    });
  }

  const state = kind === WORK_INTERRUPTION.CANCEL
    ? WORK_INTERRUPTION.CANCELLED_BY_OWNER
    : kind;
  return Object.freeze({
    requested: kind,
    state,
    mode: "INTERRUPTION",
    cancellable: true,
    terminal: true,
    reason: kind,
    actions: Object.freeze(["return"]),
  });
}
