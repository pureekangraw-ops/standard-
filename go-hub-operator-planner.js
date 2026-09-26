import { getCityDestination } from "./go-hub-route-contract.js";

function valueText(value) {
  const result = String(value ?? "").trim();
  return result || null;
}

function normalizeAllowedDestinations(values = []) {
  const result = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const destination = getCityDestination(value);
    if (destination) result.add(destination.route);
  }
  return result;
}

const SURFACES = Object.freeze([
  { id:"pixie", route:"destination://factory", patterns:[/\bpixie\b/i,/พิกซี/i] },
  { id:"lighthouse", route:"destination://lighthouse", patterns:[/\blighthouse\b/i,/ไลท์เฮาส์/i,/ไลท์เฮ้าส์/i] },
  { id:"maintenance", route:"destination://maintenance", patterns:[/\bmaintenance\b/i,/system check/i,/ตรวจ(?:ทั้ง)?ระบบ/i,/ซ่อม(?:ทั้ง)?ระบบ/i] },
  { id:"github", route:"destination://github", patterns:[/\bgithub\b/i,/กิทฮับ/i,/pull request/i,/\bpr\b/i] },
  { id:"factory", route:"destination://factory", patterns:[/\bfactory\b/i,/โรงงาน/i,/\bcode\b/i,/โค้ด/i,/\bci\b/i,/deploy/i,/branch/i] },
  { id:"drive", route:"destination://drive", patterns:[/\bdrive\b/i,/google drive/i,/ไดรฟ์/i,/ไฟล์/i] },
  { id:"gmail", route:"destination://gmail", patterns:[/\bgmail\b/i,/อีเมล/i,/เมล/i] },
  { id:"calendar", route:"destination://calendar", patterns:[/\bcalendar\b/i,/ปฏิทิน/i,/นัดหมาย/i] },
  { id:"browser", route:"destination://browser", patterns:[/\bbrowser\b/i,/observer/i,/เบราว์เซอร์/i,/หน้าเว็บ/i] },
  { id:"linear", route:"destination://linear", patterns:[/\blinear\b/i] },
  { id:"notion", route:"destination://notion", patterns:[/\bnotion\b/i,/โนชั่น/i] },
  { id:"counter", route:"destination://counter", patterns:[/\bcounter\b/i,/เคาน์เตอร์/i,/ถามไลท์/i,/\blight\b/i] },
]);

const HUB_WIDE_PATTERNS = Object.freeze([
  /ทั้งฮับ/i,/ทั้งระบบ/i,/ทุกห้อง/i,/ทุกจุด/i,/whole hub/i,/across (?:the )?hub/i,/hub[- ]wide/i,
]);

const READ_PATTERNS = Object.freeze([
  /ตรวจ/i,/เช็ก/i,/เช็ค/i,/ดู(?:สถานะ)?/i,/อ่าน/i,/ค้น/i,
  /inspect/i,/check/i,/read/i,/search/i,/status/i,/verify/i,
]);

const ACT_PATTERNS = Object.freeze([
  /แก้/i,/ซ่อม/i,/สร้าง/i,/อัปเดต/i,/ส่ง/i,/ย้าย/i,/ลบ/i,/ทำต่อ/i,
  /fix/i,/repair/i,/create/i,/update/i,/send/i,/move/i,/delete/i,/continue/i,/deploy/i,
]);

const PHYSICAL_PATTERNS = Object.freeze([
  /มือถือ/i,/โทรศัพท์/i,/เครื่องจริง/i,/physical/i,/device/i,/กดเอง/i,/ใช้มือ/i,
]);

function hasAny(input, patterns) {
  return patterns.some(pattern => pattern.test(input));
}

function inferIntent(command) {
  const reads = hasAny(command, READ_PATTERNS);
  const acts = hasAny(command, ACT_PATTERNS);
  if (reads && acts) return "READ_THEN_ACT";
  if (acts) return "ACT";
  return "READ";
}

function inferSurfaces(command) {
  return SURFACES.filter(surface => surface.patterns.some(pattern => pattern.test(command)));
}

function inferMode(command, explicitMode, surfaceCount) {
  const requested = String(explicitMode || "AUTO").toUpperCase();
  if (requested === "LOCAL" || requested === "HUB") return requested;
  if (hasAny(command, HUB_WIDE_PATTERNS) || surfaceCount > 1) return "HUB";
  return "LOCAL";
}

function buildStopConditions(command) {
  const conditions = [
    "UNKNOWN",
    "PASS_INACTIVE",
    "DESTINATION_NOT_ALLOWED",
    "AUTHORITY_ESCALATION_REQUIRED",
    "REQUESTED_RESULT_CHANGE",
    "TOOL_REQUIRES_EXPLICIT_APPROVAL",
  ];
  if (hasAny(command, PHYSICAL_PATTERNS)) conditions.push("PHYSICAL_ACTION_REQUIRED");
  return Object.freeze(conditions);
}

export function createOperatorCommandPlan({
  command,
  requestedResult = null,
  mode = "AUTO",
  allowedDestinations = [],
  passState = "UNKNOWN",
  workStatus = "UNKNOWN",
} = {}) {
  const normalizedCommand = valueText(command);
  if (!normalizedCommand) throw new Error("operator command is required");

  let surfaces = inferSurfaces(normalizedCommand);
  const hubWide = hasAny(normalizedCommand, HUB_WIDE_PATTERNS);
  if (!surfaces.length && hubWide) {
    surfaces = [{ id:"maintenance", route:"destination://maintenance", patterns:[] }];
  }

  const allowed = normalizeAllowedDestinations(allowedDestinations);
  const inferredMode = inferMode(normalizedCommand, mode, surfaces.length);
  const intent = inferIntent(normalizedCommand);
  const activePass = String(passState || "").toUpperCase() === "ACTIVE" &&
    String(workStatus || "").toUpperCase() === "ON PROCESS";

  const executionPolicy = Object.freeze({
    execute:false,
    mutate:false,
    canWidenAuthority:false,
    sourceOfAuthority:"CENTRE_WORK_PASS",
  });

  if (!surfaces.length) {
    return Object.freeze({
      version:"GO_OPERATOR_PLAN_V1",
      status:"NEEDS_TARGET",
      mode:inferredMode,
      command:normalizedCommand,
      requestedResult:valueText(requestedResult),
      intent,
      steps:Object.freeze([]),
      unknowns:Object.freeze(["TARGET_UNRESOLVED"]),
      stopConditions:buildStopConditions(normalizedCommand),
      executionPolicy,
    });
  }

  const seen = new Set();
  const steps = [];
  for (const surface of surfaces) {
    const key = surface.id + "|" + surface.route;
    if (seen.has(key)) continue;
    seen.add(key);
    const permitted = activePass && allowed.has(surface.route);
    steps.push(Object.freeze({
      stepId:`STEP-${String(steps.length + 1).padStart(2, "0")}`,
      surface:surface.id,
      destination:surface.route,
      intent,
      objective:normalizedCommand,
      permission:permitted ? "ALLOWED_BY_CURRENT_PASS" : "BLOCKED_BY_CURRENT_PASS",
    }));
  }

  const blocked = steps.filter(step => step.permission !== "ALLOWED_BY_CURRENT_PASS");
  return Object.freeze({
    version:"GO_OPERATOR_PLAN_V1",
    status:blocked.length ? "PLAN_WITH_BLOCKED_ROUTES" : "PLANNED",
    mode:inferredMode,
    command:normalizedCommand,
    requestedResult:valueText(requestedResult),
    intent,
    steps:Object.freeze(steps),
    unknowns:Object.freeze([]),
    stopConditions:buildStopConditions(normalizedCommand),
    executionPolicy,
  });
}
