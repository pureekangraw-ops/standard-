const PASS = "PASS";
const WAIT = "WAIT";

function normalized(value) {
  return String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function normalizeRoute(route = {}) {
  return Object.freeze({
    id: String(route.id || "").trim(),
    intents: Object.freeze((Array.isArray(route.intents) ? route.intents : [])
      .map(normalized)
      .filter(Boolean)),
    route: String(route.route || "").trim(),
    status: normalized(route.status),
    permission: normalized(route.permission),
  });
}

function wait(reason) {
  return Object.freeze({
    status: WAIT,
    waitReason: reason,
    departmentId: null,
    route: null,
  });
}

export function createMimirDirectoryResolver({ routes = [] } = {}) {
  if (!Array.isArray(routes)) throw new TypeError("MIMIR directory routes must be an array");
  const directory = Object.freeze(routes.map(normalizeRoute));

  return function resolveDirectory({ intent = "" } = {}) {
    const requestedIntent = normalized(intent);
    if (!requestedIntent) return wait("ROUTE_INTENT_REQUIRED");

    const matches = directory.filter(entry => entry.intents.includes(requestedIntent));
    if (!matches.length) return wait("NO_ROUTE");
    if (matches.length > 1) return wait("AMBIGUOUS_ROUTE");

    const selected = matches[0];
    if (!selected.id || !selected.route) return wait("MISSING_ROUTE");
    if (selected.status !== "ACTIVE") return wait("UNAVAILABLE");
    if (selected.permission === "BLOCKED") return wait("BLOCKED");
    if (selected.permission === "REQUIRES_APPROVAL") return wait("NEED_AUTHORITY");
    if (selected.permission !== "ALLOWED") return wait("UNKNOWN");

    return Object.freeze({
      status: PASS,
      waitReason: null,
      departmentId: selected.id,
      route: selected.route,
    });
  };
}
