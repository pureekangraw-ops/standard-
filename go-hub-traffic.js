function required(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function queueDepth(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error("traffic queue must be a non-negative integer or null");
  return number;
}

function iso(value) {
  const text = required(value, "traffic updatedAt");
  if (Number.isNaN(new Date(text).getTime())) throw new Error("traffic updatedAt must be an ISO date");
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
  return Object.freeze({
    station: required(input.station, "traffic station"),
    activity: required(input.activity, "traffic activity"),
    queue: queueDepth(input.queue),
    blocker: String(input.blocker || "").trim() || null,
    updatedAt: iso(input.updatedAt),
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
        activity: "UNKNOWN",
        queue: null,
        blocker: null,
        updatedAt: null,
        freshness: "UNKNOWN",
      });
    }
    const ageMs = Math.max(0, clock.getTime() - new Date(summary.updatedAt).getTime());
    return Object.freeze({
      ...summary,
      freshness: ageMs > threshold ? "STALE" : "CURRENT",
    });
  }));
}
