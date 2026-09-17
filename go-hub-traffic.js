const TRAFFIC_STATUSES = Object.freeze(["NORMAL", "BUSY", "FULL", "ERROR", "UNKNOWN", "STALE"]);
const TRAFFIC_STATUS_SET = new Set(TRAFFIC_STATUSES);
const SUMMARY_FIELDS = new Set(["station", "status", "active", "queue", "blocked", "lastUpdate"]);

function required(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function status(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!TRAFFIC_STATUS_SET.has(normalized)) throw new Error(`unsupported traffic status: ${normalized || "UNKNOWN"}`);
  return normalized;
}

function nullableCount(value, label) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label} must be a non-negative integer or null`);
  return number;
}

function nullableBlocked(value) {
  if (value == null) return null;
  if (typeof value !== "boolean") throw new Error("traffic blocked must be boolean or null");
  return value;
}

function iso(value) {
  const text = required(value, "traffic lastUpdate");
  if (Number.isNaN(new Date(text).getTime())) throw new Error("traffic lastUpdate must be an ISO date");
  return text;
}

function observedAt(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("traffic now must be a valid date");
  return date;
}

function maxAge(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error("traffic staleAfterMs must be a non-negative number");
  return number;
}

export function createTrafficSummary(input = {}) {
  for (const key of Object.keys(input)) {
    if (!SUMMARY_FIELDS.has(key)) throw new Error(`unknown traffic summary field: ${key}`);
  }
  return Object.freeze({
    station: required(input.station, "traffic station"),
    status: status(input.status),
    active: nullableCount(input.active, "traffic active"),
    queue: nullableCount(input.queue, "traffic queue"),
    blocked: nullableBlocked(input.blocked),
    lastUpdate: iso(input.lastUpdate),
  });
}

export function createTrafficSnapshot({
  stations = [],
  summaries = [],
  now = new Date(),
  staleAfterMs = 15 * 60 * 1000,
} = {}) {
  if (!Array.isArray(stations)) throw new TypeError("traffic stations must be an array");
  if (!Array.isArray(summaries)) throw new TypeError("traffic summaries must be an array");

  const clock = observedAt(now);
  const threshold = maxAge(staleAfterMs);
  const byStation = new Map();
  for (const summary of summaries) {
    const normalized = createTrafficSummary(summary);
    byStation.set(normalized.station, normalized);
  }

  return Object.freeze(stations.map(value => {
    const station = required(value, "traffic station");
    const summary = byStation.get(station);
    if (!summary) {
      return Object.freeze({
        station,
        status: "UNKNOWN",
        active: null,
        queue: null,
        blocked: null,
        lastUpdate: null,
      });
    }
    const ageMs = Math.max(0, clock.getTime() - new Date(summary.lastUpdate).getTime());
    return Object.freeze({
      ...summary,
      status: ageMs > threshold ? "STALE" : summary.status,
    });
  }));
}

export { TRAFFIC_STATUSES };
