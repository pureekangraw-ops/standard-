export const PIN_INTENT_MODES = Object.freeze(["REUSE", "CREATE", "REVIEW"]);

const REUSE_PREFIXES = Object.freeze([
  "ต่องาน",
  "ทำต่อ",
  "ต่อ",
  "แก้ไข",
  "แก้",
  "continue",
  "resume",
  "edit",
  "update",
]);

const CREATE_PREFIXES = Object.freeze([
  "สร้าง",
  "เริ่มใหม่",
  "ทำใหม่",
  "create",
  "new",
  "start new",
]);

function freeze(value) {
  return Object.freeze({ ...value });
}

function commandText(value) {
  return String(value ?? "").trim();
}

function classify(value) {
  const raw = commandText(value);
  const normalized = raw.toLocaleLowerCase("en");
  if (!normalized) return "REVIEW";
  if (CREATE_PREFIXES.some(prefix => normalized.startsWith(prefix))) return "CREATE";
  if (REUSE_PREFIXES.some(prefix => normalized.startsWith(prefix))) return "REUSE";
  return "REVIEW";
}

function assertIntent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      value.policy !== "FIRST_COMMAND_STICKY" ||
      !PIN_INTENT_MODES.includes(value.mode) ||
      !commandText(value.firstCommand)) {
    throw new Error("PIN_ROUTE_INTENT_REQUIRED");
  }
  return value;
}

function pinIdentity(pin) {
  if (!pin || typeof pin !== "object" || Array.isArray(pin)) return null;
  const pinId = commandText(pin.pinId);
  if (!pinId) return null;
  return {
    pinId,
    status:commandText(pin.status).toUpperCase() || "OPEN",
  };
}

export function lockPinIntent(firstCommand) {
  const raw = commandText(firstCommand);
  if (!raw) throw new Error("PIN_ROUTE_FIRST_COMMAND_REQUIRED");
  return freeze({
    policy:"FIRST_COMMAND_STICKY",
    mode:classify(raw),
    firstCommand:raw,
  });
}

export function assertSamePinIntent(lockedIntent, nextCommand) {
  const locked = assertIntent(lockedIntent);
  const nextMode = classify(nextCommand);
  if (nextMode !== "REVIEW" && nextMode !== locked.mode) {
    throw new Error("PIN_ROUTE_INTENT_CONFLICT");
  }
  return locked;
}

export function resolvePinRoute({ intent, pin = null } = {}) {
  const locked = assertIntent(intent);

  if (locked.mode === "CREATE") {
    return freeze({
      policy:locked.policy,
      mode:locked.mode,
      action:"CREATE_NEW",
      pinId:null,
      nextStatus:null,
      createAllowed:true,
    });
  }

  if (locked.mode === "REVIEW") {
    return freeze({
      policy:locked.policy,
      mode:locked.mode,
      action:"REVIEW_REQUIRED",
      pinId:null,
      nextStatus:null,
      createAllowed:false,
    });
  }

  const existing = pinIdentity(pin);
  if (!existing) {
    return freeze({
      policy:locked.policy,
      mode:locked.mode,
      action:"LOOKUP_REQUIRED",
      pinId:null,
      nextStatus:null,
      createAllowed:false,
    });
  }

  if (existing.status === "ARCHIVED") {
    return freeze({
      policy:locked.policy,
      mode:locked.mode,
      action:"REOPEN_EXISTING",
      pinId:existing.pinId,
      nextStatus:"REOPENED",
      createAllowed:false,
    });
  }

  return freeze({
    policy:locked.policy,
    mode:locked.mode,
    action:"USE_EXISTING",
    pinId:existing.pinId,
    nextStatus:null,
    createAllowed:false,
  });
}

export function createBoardPinRouteReadService() {
  return Object.freeze({
    read({ firstCommand, pin = null } = {}) {
      const intent = lockPinIntent(firstCommand);
      const route = resolvePinRoute({ intent, pin });
      return Object.freeze({ intent, route });
    },
  });
}
