const DEFAULT_STATE_NAME = "go-hub-broadcast-v1";
export const BOOTSTRAP_BROADCAST = Object.freeze({
  program: "GO_HUB_SYSTEM",
  version: "V4",
  hash: "bc9d1a138773c7884b2eee2d7c40877b2cad52f9",
  sourceRef: "github://pureekangraw-ops/standard-/GO_HUB_V4_CUTOVER.json",
  activatedBy: "SYSTEM_BOOTSTRAP",
  activatedAt: null,
});

function text(value) { return String(value ?? "").trim(); }
function clone(value) { return value == null ? value : structuredClone(value); }
function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
function required(value, label) {
  const result = text(value);
  if (!result) throw Object.assign(new Error(label + " is required"), { status: 400 });
  return result;
}
function identity(value = {}) {
  return {
    program: text(value.program),
    version: text(value.version),
    hash: text(value.hash),
  };
}
function sameIdentity(a, b) {
  return a.program === b.program && a.version === b.version && a.hash === b.hash;
}
function normalizeBroadcast(input = {}, { now = () => new Date().toISOString() } = {}) {
  if (text(input.actor).toUpperCase() !== "GO") {
    throw Object.assign(new Error("BROADCAST_GO_ONLY"), { status: 403 });
  }
  return Object.freeze({
    program: required(input.program, "Broadcast program"),
    version: required(input.version, "Broadcast version"),
    hash: required(input.hash, "Broadcast hash"),
    sourceRef: required(input.sourceRef, "Broadcast source ref"),
    activatedBy: "GO",
    activatedAt: now(),
  });
}

export function compareBroadcast(current, observed, { area = "unknown" } = {}) {
  const expected = identity(current || {});
  if (!expected.program || !expected.version || !expected.hash) {
    return Object.freeze({
      ok: false,
      code: "NO_BROADCAST",
      area,
      expected: null,
      observed: observed ? identity(observed) : null,
      next: "MAINTENANCE_RUNNER",
    });
  }
  if (observed == null) {
    return Object.freeze({
      ok: true,
      status: "BROADCAST_LOCKED",
      area,
      current: clone(current),
    });
  }
  const actual = identity(observed);
  if (!actual.program || !actual.version || !actual.hash || !sameIdentity(expected, actual)) {
    return Object.freeze({
      ok: false,
      code: "BROADCAST_MISMATCH",
      area,
      expected,
      observed: actual,
      next: "MAINTENANCE_RUNNER",
    });
  }
  return Object.freeze({
    ok: true,
    status: "BROADCAST_LOCKED",
    area,
    current: clone(current),
  });
}

export class GoHubBroadcastState {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async current() {
    return clone((await this.ctx.storage.get("current")) || BOOTSTRAP_BROADCAST);
  }

  async fetch(request) {
    try {
      if (request.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED" }, 405);
      const input = await request.json().catch(() => null);
      if (!input || typeof input !== "object" || Array.isArray(input)) return json({ code: "INVALID_JSON" }, 400);
      const action = text(input.action).toLowerCase();
      if (action === "current") {
        return json({ ok: true, broadcast: await this.current() });
      }
      if (action === "activate") {
        const next = normalizeBroadcast(input);
        await this.ctx.storage.put("current", clone(next));
        return json({ ok: true, status: "BROADCAST_ACTIVATED", broadcast: clone(next) });
      }
      return json({ code: "BROADCAST_ACTION_UNAVAILABLE" }, 400);
    } catch (error) {
      return json({ code: error?.message || "BROADCAST_ERROR" }, error?.status || 400);
    }
  }
}

function stubFor(namespace, name = DEFAULT_STATE_NAME) {
  if (!namespace || typeof namespace.getByName !== "function") return null;
  return namespace.getByName(name);
}
async function call(stub, payload) {
  if (!stub || typeof stub.fetch !== "function") return null;
  const response = await stub.fetch(new Request("https://broadcast.internal/state", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }));
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

export function createBroadcastService({ namespace, name = DEFAULT_STATE_NAME } = {}) {
  const stub = stubFor(namespace, name);
  return Object.freeze({
    async current() {
      const result = await call(stub, { action: "current" });
      if (!result) return json({ code: "BROADCAST_STATE_NOT_CONFIGURED" }, 503);
      return json({ ...result.body, configured: true }, result.response.status);
    },
    async activate(input = {}) {
      if (!stub) return json({ code: "BROADCAST_STATE_NOT_CONFIGURED" }, 503);
      const result = await call(stub, { ...input, action: "activate", actor: "GO" });
      return json(result.body, result.response.status);
    },
    async speaker({ area, observed = null } = {}) {
      const speakerArea = text(area) || "unknown";
      const result = await call(stub, { action: "current" });
      if (!result || !result.response.ok || !result.body?.broadcast) {
        return Object.freeze({
          ok: false,
          code: "NO_BROADCAST",
          area: speakerArea,
          expected: null,
          observed: observed ? identity(observed) : null,
          next: "MAINTENANCE_RUNNER",
        });
      }
      return compareBroadcast(result.body.broadcast, observed, { area: speakerArea });
    },
  });
}

export { DEFAULT_STATE_NAME, normalizeBroadcast };
