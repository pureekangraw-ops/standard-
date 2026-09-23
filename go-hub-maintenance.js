import { planCloseout } from "./go-hub-housekeeper.js";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const STATUSES = Object.freeze(["PASS", "WAIT", "BLOCKED", "FAIL", "UNKNOWN", "NOT_CHECKED"]);
const SAFE_PROBE_MODES = new Set(["READ", "PREFLIGHT", "SAFE_TEST"]);
const ACTIONS = Object.freeze([
  "inspect",
  "inspect_map",
  "run_system_check",
  "probe_route",
  "repair_context",
  "plan_closeout",
]);

function text(value) { return String(value ?? "").trim(); }

function requireMaintenanceWork(input = {}) {
  const workId = text(input.workId);
  const pass = text(input.maintenancePass || input.pass).toUpperCase();
  if (!workId) return { ok: false, code: "MAINTENANCE_WORK_REQUIRED" };
  if (pass !== "ACTIVE") return { ok: false, code: "MAINTENANCE_PASS_REQUIRED", workId };
  return { ok: true, workId, pass: "ACTIVE" };
}

function normalizeMap(map = {}) {
  const routes = Array.isArray(map.routes) ? map.routes : [];
  return Object.freeze({
    source: text(map.source) || "GO_DEFINED_MAINTENANCE_MAP",
    routes: Object.freeze(routes.map(route => Object.freeze({
      id: text(route.id),
      from: text(route.from),
      to: text(route.to),
      checkpoints: Object.freeze((Array.isArray(route.checkpoints) ? route.checkpoints : []).map(point => Object.freeze({
        id: text(point.id),
        importantValue: text(point.importantValue),
        expected: point.expected ?? null,
        source: text(point.source),
        probeAction: text(point.probeAction),
        mode: text(point.mode).toUpperCase() || "READ",
        ownerSource: text(point.ownerSource),
      }))),
    }))),
  });
}

function compareObserved(expected, observed) {
  if (expected === null || expected === undefined || expected === "") {
    return { status: "UNKNOWN", reason: "EXPECTED_VALUE_NOT_DEFINED" };
  }
  if (typeof expected === "object" && expected !== null) {
    if (Array.isArray(expected.contains)) {
      const values = Array.isArray(observed) ? observed : [observed];
      const missing = expected.contains.filter(value => !values.includes(value));
      return missing.length
        ? { status: "FAIL", reason: "VALUE_RELATION_MISMATCH", missing }
        : { status: "PASS", reason: "EXPECTED_RELATION_PROVED" };
    }
    if (Object.hasOwn(expected, "equals")) {
      return Object.is(expected.equals, observed)
        ? { status: "PASS", reason: "EXPECTED_VALUE_PROVED" }
        : { status: "FAIL", reason: "VALUE_MISMATCH" };
    }
  }
  return Object.is(expected, observed)
    ? { status: "PASS", reason: "EXPECTED_VALUE_PROVED" }
    : { status: "FAIL", reason: "VALUE_MISMATCH" };
}

async function probeCheckpoint(point, readValue) {
  if (!point.id || !point.importantValue || !point.source || !point.probeAction) {
    return { checkpointId: point.id || null, status: "UNKNOWN", reason: "CHECKPOINT_DEFINITION_INCOMPLETE" };
  }
  if (!SAFE_PROBE_MODES.has(point.mode)) {
    return { checkpointId: point.id, status: "BLOCKED", reason: "UNSAFE_PROBE_MODE", mode: point.mode };
  }
  try {
    const observation = await readValue(point);
    if (!observation || observation.available === false) {
      return { checkpointId: point.id, status: "UNKNOWN", reason: observation?.reason || "OBSERVED_VALUE_UNAVAILABLE" };
    }
    const compared = compareObserved(point.expected, observation.value);
    return {
      checkpointId: point.id,
      importantValue: point.importantValue,
      expected: point.expected,
      observed: observation.value,
      source: point.source,
      ownerSource: point.ownerSource || null,
      evidence: observation.evidence || null,
      ...compared,
    };
  } catch (error) {
    return { checkpointId: point.id, status: "UNKNOWN", reason: "PROBE_READ_FAILED", error: error?.message || String(error) };
  }
}

async function probeRoute(route, readValue) {
  const results = [];
  let stopped = false;
  for (const point of route.checkpoints) {
    if (stopped) {
      results.push({ checkpointId: point.id, status: "NOT_CHECKED", reason: "DOWNSTREAM_OF_FIRST_BREAK" });
      continue;
    }
    const result = await probeCheckpoint(point, readValue);
    results.push(result);
    if (["FAIL", "BLOCKED"].includes(result.status)) stopped = true;
  }
  const firstBreak = results.find(result => ["FAIL", "BLOCKED"].includes(result.status)) || null;
  const lastChecked = [...results].reverse().find(result => result.status !== "NOT_CHECKED") || null;
  return {
    routeId: route.id,
    from: route.from,
    to: route.to,
    status: firstBreak ? firstBreak.status : (results.some(r => r.status === "UNKNOWN") ? "UNKNOWN" : "PASS"),
    firstBreak: firstBreak?.checkpointId || null,
    reachedUntil: lastChecked?.checkpointId || null,
    checkpoints: results,
  };
}

export function createMaintenanceService({
  readValue = async () => ({ available: false, reason: "PROBE_READER_NOT_CONFIGURED" }),
  now = () => new Date().toISOString(),
  traceId = () => `maintenance-${Date.now()}`,
} = {}) {
  return Object.freeze({
    async maintenance(input = {}) {
      const work = requireMaintenanceWork(input);
      if (!work.ok) return json(work, 409);

      const action = text(input.action).toLowerCase();
      const map = normalizeMap(input.maintenanceMap || input.map || {});

      if (action === "inspect") {
        return json({
          status: "MAINTENANCE_READY",
          workId: work.workId,
          maintenancePass: "ACTIVE",
          authority: "GO_MAINTENANCE_WORK",
          servicePath: "ALL_GO_HUB_OWNED_AREAS",
          actions: ACTIONS,
          autoRepair: false,
        });
      }

      if (action === "inspect_map") {
        return json({ status: "MAINTENANCE_MAP_READY", workId: work.workId, map });
      }

      if (action === "probe_route" || action === "run_system_check") {
        const selected = action === "probe_route"
          ? map.routes.filter(route => route.id === text(input.routeId))
          : map.routes;
        if (!selected.length) {
          return json({ code: "MAINTENANCE_ROUTE_NOT_FOUND", workId: work.workId, routeId: text(input.routeId) || null }, 404);
        }
        const routes = [];
        for (const route of selected) routes.push(await probeRoute(route, readValue));
        const hasFailure = routes.some(route => ["FAIL", "BLOCKED"].includes(route.status));
        return json({
          status: hasFailure ? "MAINTENANCE_CHECK_ATTENTION" : "MAINTENANCE_CHECK_COMPLETE",
          workId: work.workId,
          maintenancePass: "ACTIVE",
          traceId: traceId(),
          checkedAt: now(),
          routes,
          repairAllowed: true,
          autoRepair: false,
          next: hasFailure ? "GO_DIAGNOSE_REPAIR" : (action === "probe_route" ? "ROUTE_VERIFIED" : "FULL_SYSTEM_CHECK_VERIFIED"),
        });
      }

      if (action === "repair_context") {
        return json({
          status: "MAINTENANCE_REPAIR_CONTEXT",
          workId: work.workId,
          maintenancePass: "ACTIVE",
          servicePath: "ALL_GO_HUB_OWNED_AREAS",
          routeId: text(input.routeId) || null,
          checkpointId: text(input.checkpointId) || null,
          instruction: "GO_REPAIRS_THEN_REPROBES_ROUTE",
          autoRepair: false,
        });
      }

      if (action === "plan_closeout") {
        try {
          return json({
            status: "MAINTENANCE_PLAN_READY",
            workId: work.workId,
            next: "REPROBE_ROUTE_THEN_FULL_SYSTEM_CHECK_BEFORE_RETURN",
            plan: planCloseout(input.input || {}),
            autoRepair: false,
          });
        } catch (error) {
          return json({ code: "MAINTENANCE_PLAN_REFUSED", message: error?.message || "plan refused" }, 409);
        }
      }

      return json({ code: "MAINTENANCE_ACTION_UNAVAILABLE", action, actions: ACTIONS }, 400);
    },
  });
}

export { ACTIONS, SAFE_PROBE_MODES, STATUSES, normalizeMap, compareObserved };
