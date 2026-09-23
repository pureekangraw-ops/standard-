const DESTINATIONS = Object.freeze({
  factory: Object.freeze({ id: "factory", role: "building-entry", route: "destination://factory" }),
  drive: Object.freeze({ id: "drive", role: "storage-entry", route: "destination://drive" }),
  linear: Object.freeze({ id: "linear", role: "work-tracking-entry", route: "destination://linear" }),
  browser: Object.freeze({ id: "browser", role: "reality-entry", route: "destination://browser" }),
  maintenance: Object.freeze({ id: "maintenance", role: "maintenance-entry", route: "destination://maintenance" }),
  notion: Object.freeze({ id: "notion", role: "notion-gate-entry", route: "destination://notion" }),
  counter: Object.freeze({ id: "counter", role: "agent-handoff-entry", route: "destination://counter" }),
});

const WORK_CONTEXT_FIELDS = Object.freeze([
  "workId", "checkpointId", "returnAddress", "destination",
  "task", "requestedResult", "personaReference",
]);

export const CITY_DESTINATIONS = DESTINATIONS;

export function getCityDestination(value) {
  const target = String(value || "").trim();
  if (!target) return null;
  return Object.values(DESTINATIONS).find(item => item.id === target || item.route === target) || null;
}

function required(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`workContext missing field: ${label}`);
  return text;
}

export function assertCityWorkContext(value, expectedDestination) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("workContext is required");
  for (const key of Object.keys(value)) {
    if (!WORK_CONTEXT_FIELDS.includes(key)) throw new Error(`unknown workContext field: ${key}`);
  }
  const normalized = Object.fromEntries(WORK_CONTEXT_FIELDS.map(field => [field, required(value[field], field)]));
  if (normalized.checkpointId !== normalized.returnAddress) throw new Error("workContext Return Address must match Checkpoint ID");
  const actual = getCityDestination(normalized.destination);
  const expected = getCityDestination(expectedDestination);
  if (!actual || !expected || actual.id !== expected.id) {
    throw new Error(`workContext destination must be ${expected?.route || String(expectedDestination || "").trim() || "a canonical destination"}`);
  }
  normalized.destination = actual.route;
  return Object.freeze(normalized);
}
