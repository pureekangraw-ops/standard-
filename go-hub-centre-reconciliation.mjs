export const CENTRE_RECONCILIATION_ALARM_MS = 15_000;
export const CENTRE_RECONCILIATION_LIMIT = 100;

const CENTRE_EVENT_PREFIX = "CENTRE_";

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function codeOf(error, fallback = "CENTRE_RECONCILIATION_FAILED") {
  return clean(error?.code || error?.message) || fallback;
}

function validCursor(value) {
  const cursor = Number(value);
  return Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0;
}

function sessionIsActive(state, now) {
  const session = state?.session;
  return Boolean(
    session?.active === true &&
    Number.isFinite(Number(session.expiresAt)) &&
    Number(now) < Number(session.expiresAt),
  );
}

function reconciliationState(state) {
  const source = state?.reconciliation && typeof state.reconciliation === "object"
    ? state.reconciliation
    : {};
  return {
    cursor: validCursor(source.cursor),
    lastRunAt: clean(source.lastRunAt) || null,
    lastError: clean(source.lastError) || null,
    lastProcessedWorkIds: Array.isArray(source.lastProcessedWorkIds)
      ? [...new Set(source.lastProcessedWorkIds.map(clean).filter(Boolean))]
      : [],
  };
}

async function jsonBody(response) {
  if (!response || typeof response.json !== "function") {
    throw new Error("CENTRE_RECONCILIATION_INVALID_RESPONSE");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) {
    throw Object.assign(new Error(body?.code || "CENTRE_RECONCILIATION_SOURCE_FAILED"), {
      code: body?.code || "CENTRE_RECONCILIATION_SOURCE_FAILED",
    });
  }
  return body;
}

function workIdsFromHistory(events) {
  return [...new Set(
    (Array.isArray(events) ? events : [])
      .filter(record => clean(record?.event?.type).startsWith(CENTRE_EVENT_PREFIX))
      .map(record => clean(record?.event?.workId))
      .filter(Boolean),
  )];
}

function auditHistoryRequest(audit, input) {
  if (!audit || typeof audit.history !== "function") {
    throw new Error("GLOBAL_AUDIT_NOT_CONFIGURED");
  }
  return audit.history(input);
}

async function inspectCentre(centreNamespace, workId) {
  if (!centreNamespace || typeof centreNamespace.getByName !== "function") {
    throw new Error("CENTRE_STATE_NOT_CONFIGURED");
  }
  const stub = centreNamespace.getByName(workId);
  if (!stub || typeof stub.fetch !== "function") {
    throw new Error("CENTRE_STATE_NOT_CONFIGURED");
  }
  return jsonBody(await stub.fetch(new Request("https://centre-state.internal/inspect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "inspect", workId }),
  })));
}

export function createCentreReconciliationService({
  storage,
  audit,
  centreNamespace,
  projectCentre,
  now = () => Date.now(),
  limit = CENTRE_RECONCILIATION_LIMIT,
} = {}) {
  if (!storage || typeof storage.get !== "function" || typeof storage.put !== "function") {
    throw new TypeError("Centre reconciliation storage required");
  }
  if (typeof projectCentre !== "function") {
    throw new TypeError("Centre reconciliation projectCentre required");
  }

  async function load() {
    const state = await storage.get("state");
    return state && typeof state === "object" ? state : null;
  }

  async function save(state) {
    await storage.put("state", clone(state));
    return state;
  }

  async function recordFailure(state, error, at) {
    const latest = (await load()) || state || {};
    latest.reconciliation = {
      ...reconciliationState(latest),
      lastRunAt: at,
      lastError: codeOf(error),
    };
    await save(latest);
    return {
      ok: false,
      active: sessionIsActive(latest, now()),
      cursor: reconciliationState(latest).cursor,
      code: codeOf(error),
      processedWorkIds: [],
    };
  }

  return Object.freeze({
    async reconcile() {
      const startedAt = new Date(Number(now())).toISOString();
      const state = await load();
      if (!sessionIsActive(state, now())) {
        return {
          ok: true,
          active: false,
          skipped: "LIGHT_SESSION_INACTIVE",
          cursor: reconciliationState(state).cursor,
          processedWorkIds: [],
        };
      }

      const reconciliation = reconciliationState(state);
      try {
        const response = await auditHistoryRequest(audit, {
          afterSequence: reconciliation.cursor,
          limit,
        });
        const history = await jsonBody(response);
        const nextCursor = Math.max(
          reconciliation.cursor,
          validCursor(history.lastSequence),
        );
        const workIds = workIdsFromHistory(history.events);
        const projected = [];

        for (const workId of workIds) {
          const truth = await inspectCentre(centreNamespace, workId);
          const projection = await projectCentre(truth);
          if (!projection?.ok) {
            throw Object.assign(
              new Error(projection?.code || "CENTRE_RECONCILIATION_PROJECT_FAILED"),
              { code: projection?.code || "CENTRE_RECONCILIATION_PROJECT_FAILED" },
            );
          }
          projected.push({
            workId,
            changed: projection.changed === true,
          });
        }

        const next = {
          ...state,
          reconciliation: {
            cursor: nextCursor,
            lastRunAt: startedAt,
            lastError: null,
            lastProcessedWorkIds: workIds,
          },
        };
        await save(next);
        return {
          ok: true,
          active: true,
          cursor: nextCursor,
          processedWorkIds: workIds,
          projected,
        };
      } catch (error) {
        return recordFailure(state, error, startedAt);
      }
    },
  });
}

export function centreSessionIsActive(state, now = Date.now()) {
  return sessionIsActive(state, now);
}

export function centreReconciliationState(state) {
  return reconciliationState(state);
}
