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

export function createTrafficSummary(input = {}) {
  return Object.freeze({
    station: required(input.station, "traffic station"),
    activity: required(input.activity, "traffic activity"),
    queue: queueDepth(input.queue),
    blocker: String(input.blocker || "").trim() || null,
    updatedAt: iso(input.updatedAt),
  });
}
