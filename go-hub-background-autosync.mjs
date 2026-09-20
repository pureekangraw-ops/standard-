const DEFAULT_INTERVAL_MS = 15_000;

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function errorMessage(error) {
  return String(error?.message || error || "AUTOSYNC_FAILED").slice(0, 240);
}

function statusSnapshot(state) {
  return clone({
    running: state.running,
    inFlight: state.inFlight,
    lastAttemptAt: state.lastAttemptAt,
    lastSuccessAt: state.lastSuccessAt,
    lastChangedAt: state.lastChangedAt,
    lastError: state.lastError,
    syncCount: state.syncCount,
    projectedCount: state.projectedCount,
    skippedCount: state.skippedCount,
  });
}

/**
 * Coordinates a background read -> project loop.
 *
 * The source reader and projector are injected deliberately. This module owns
 * scheduling, overlap protection, deduplication, and observable state; it
 * does not own GitHub, Linear, Durable Object, or UI authority.
 */
export function createBackgroundAutosync({
  readView,
  projectCentre,
  intervalMs = DEFAULT_INTERVAL_MS,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
  now = () => new Date().toISOString(),
  onEvent = async () => {},
} = {}) {
  if (typeof readView !== "function") throw new TypeError("AUTOSYNC_READ_REQUIRED");
  if (typeof projectCentre !== "function") throw new TypeError("AUTOSYNC_PROJECTOR_REQUIRED");
  if (!Number.isFinite(Number(intervalMs)) || Number(intervalMs) <= 0) {
    throw new TypeError("AUTOSYNC_INTERVAL_INVALID");
  }
  if (typeof setTimeoutFn !== "function" || typeof clearTimeoutFn !== "function") {
    throw new TypeError("AUTOSYNC_TIMER_REQUIRED");
  }
  if (typeof now !== "function") throw new TypeError("AUTOSYNC_CLOCK_REQUIRED");
  if (typeof onEvent !== "function") throw new TypeError("AUTOSYNC_EVENT_HOOK_REQUIRED");

  const state = {
    running: false,
    inFlight: false,
    timer: null,
    lastSignature: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastChangedAt: null,
    lastError: null,
    syncCount: 0,
    projectedCount: 0,
    skippedCount: 0,
  };

  async function emit(event) {
    try {
      await onEvent(clone(event));
    } catch {
      // Telemetry must never break the projector loop.
    }
  }

  function clearTimer() {
    if (state.timer != null) clearTimeoutFn(state.timer);
    state.timer = null;
  }

  function schedule() {
    clearTimer();
    if (!state.running) return;
    state.timer = setTimeoutFn(async () => {
      state.timer = null;
      await syncNow("interval");
      schedule();
    }, Number(intervalMs));
  }

  async function syncNow(reason = "manual") {
    if (state.inFlight) {
      state.skippedCount += 1;
      return { ok: false, skipped: true, code: "AUTOSYNC_IN_FLIGHT", status: statusSnapshot(state) };
    }

    state.inFlight = true;
    state.syncCount += 1;
    state.lastAttemptAt = now();
    state.lastError = null;

    try {
      const view = await readView();
      if (!view || typeof view !== "object" || Array.isArray(view)) {
        throw new Error("AUTOSYNC_VIEW_INVALID");
      }

      const signature = canonical(view);
      if (signature === state.lastSignature) {
        state.lastSuccessAt = now();
        await emit({ type: "AUTOSYNC_SKIPPED_UNCHANGED", reason, at: state.lastSuccessAt });
        return { ok: true, changed: false, skipped: true, status: statusSnapshot(state) };
      }

      const result = await projectCentre(view);
      if (result?.ok === false) throw new Error(result.code || "AUTOSYNC_PROJECT_FAILED");

      state.lastSignature = signature;
      state.lastSuccessAt = now();
      state.lastChangedAt = state.lastSuccessAt;
      state.projectedCount += 1;
      await emit({
        type: "AUTOSYNC_PROJECTED",
        reason,
        changed: result?.changed !== false,
        at: state.lastSuccessAt,
      });
      return { ok: true, changed: result?.changed !== false, result: clone(result), status: statusSnapshot(state) };
    } catch (error) {
      state.lastError = errorMessage(error);
      await emit({ type: "AUTOSYNC_FAILED", reason, error: state.lastError, at: now() });
      return { ok: false, code: state.lastError, status: statusSnapshot(state) };
    } finally {
      state.inFlight = false;
    }
  }

  return Object.freeze({
    async start() {
      if (state.running) return { ok: true, alreadyRunning: true, status: statusSnapshot(state) };
      state.running = true;
      const first = await syncNow("start");
      schedule();
      return { ...first, status: statusSnapshot(state) };
    },
    stop() {
      state.running = false;
      clearTimer();
      return { ok: true, status: statusSnapshot(state) };
    },
    syncNow,
    status() {
      return statusSnapshot(state);
    },
  });
}
