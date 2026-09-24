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
  const call = action => stub.fetch(new Request("https://centre-state.internal/inspect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, workId }),
  }));
  const v4 = await call("v4_inspect");
  if (v4.ok) {
    const body = await jsonBody(v4);
    return body?.v4 === true
      ? {
          ...body,
          routingWorkId:workId,
          canonicalWorkId:clean(body?.work?.workId) || null,
        }
      : { ...body, routingWorkId:workId };
  }
  const payload = await v4.clone().json().catch(() => ({}));
  const code = clean(payload?.code);
  if (code !== "unsupported Centre live action" && code !== "unsupported Centre V4 action") {
    return jsonBody(v4);
  }
  const legacy = await jsonBody(await call("inspect"));
  return { ...legacy, routingWorkId:workId };
}

export function createCentreReconciliationService({
  storage,
  audit,
  centreNamespace,
  projectCentre,
  now = () => Date.now(),
  limit = CENTRE_RECONCILIATION_LIMIT,
  requireActiveSession = true,
  seedWorkIds = [],
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
      const active = sessionIsActive(state, now());
      if (requireActiveSession && !active) {
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
        const auditedWorkIds = workIdsFromHistory(history.events);
        const seedIds = Array.isArray(seedWorkIds) ? seedWorkIds.map(clean).filter(Boolean) : [];
        const audited = new Set(auditedWorkIds);
        const seeded = new Set(seedIds);
        const workIds = [...new Set([...auditedWorkIds, ...seedIds])].slice(0, limit);
        const projected = [];
        const skippedWorkIds = [];

        for (const workId of workIds) {
          let truth;
          try {
            truth = await inspectCentre(centreNamespace, workId);
          } catch (error) {
            if (seeded.has(workId) && !audited.has(workId) && codeOf(error) === "CENTRE_WORK_NOT_FOUND") {
              skippedWorkIds.push({ workId, reason:"STALE_BOARD_SEED" });
              continue;
            }
            throw error;
          }
          const projection = await projectCentre(truth);
          if (!projection?.ok) {
            throw Object.assign(
              new Error(projection?.code || "CENTRE_RECONCILIATION_PROJECT_FAILED"),
              { code: projection?.code || "CENTRE_RECONCILIATION_PROJECT_FAILED" },
            );
          }
          projected.push({
            workId,
            canonicalWorkId:clean(truth?.canonicalWorkId) || null,
            changed: projection.changed === true,
          });
        }

        const next = {
          ...state,
          reconciliation: {
            cursor: nextCursor,
            lastRunAt: startedAt,
            lastError: null,
            lastProcessedWorkIds: projected.map(item => item.workId),
          },
        };
        await save(next);
        return {
          ok: true,
          active,
          cursor: nextCursor,
          processedWorkIds: projected.map(item => item.workId),
          skippedWorkIds,
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
