const SECRET_FIELD = /(authorization|token|secret|passcode|master.?key)/i;
const GLOBAL_NAME = "go-hub-global-audit-v1";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
function text(value) { return String(value == null ? "" : value).trim(); }
function clone(value) { return value == null ? value : structuredClone(value); }
function rejectSecrets(value, path = "root") {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_FIELD.test(key)) throw Object.assign(new Error("SECRET_FIELD_REJECTED:" + path + "." + key), { status: 400 });
    rejectSecrets(nested, path + "." + key);
  }
}
function required(value, label) {
  const normalized = text(value);
  if (!normalized) throw Object.assign(new Error(label + " is required"), { status: 400 });
  return normalized;
}
function sequenceKey(sequence) {
  return "event:" + String(sequence).padStart(16, "0");
}
function normalizeEvent(input = {}) {
  rejectSecrets(input, "event");
  return {
    eventId: required(input.eventId, "Event ID"),
    type: required(input.type, "Event type"),
    workId: required(input.workId, "Work ID"),
    checkpointId: required(input.checkpointId, "Checkpoint ID"),
    phase: text(input.phase) || null,
    targetId: text(input.targetId) || null,
    at: text(input.at) || new Date().toISOString(),
    details: input.details && typeof input.details === "object" && !Array.isArray(input.details)
      ? clone(input.details)
      : {},
  };
}
function sameEvent(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function validLimit(value) {
  if (value == null) return 100;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 && number <= 200 ? number : null;
}
function validAfter(value) {
  if (value == null) return 0;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

export class GoHubGlobalAuditLog {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async append(input = {}) {
    const event = normalizeEvent(input);
    const existingSequence = await this.ctx.storage.get("event-id:" + event.eventId);
    if (existingSequence != null) {
      const existing = await this.ctx.storage.get(sequenceKey(Number(existingSequence)));
      if (!existing || !sameEvent(existing.event, event)) {
        return json({ code: "GLOBAL_AUDIT_EVENT_ID_CONFLICT" }, 409);
      }
      return json({ ok: true, sequence: Number(existingSequence), event: clone(existing.event), idempotent: true });
    }

    const current = Number((await this.ctx.storage.get("sequence")) ?? 0);
    const sequence = current + 1;
    const record = { sequence, event };
    await this.ctx.storage.put({
      sequence,
      [sequenceKey(sequence)]: clone(record),
      ["event-id:" + event.eventId]: sequence,
    });
    return json({ ok: true, sequence, event: clone(event), idempotent: false });
  }

  async history(input = {}) {
    const limit = validLimit(input.limit);
    const afterSequence = validAfter(input.afterSequence);
    if (limit == null || afterSequence == null) return json({ code: "GLOBAL_AUDIT_INVALID_QUERY" }, 400);
    const workId = text(input.workId);
    const listed = await this.ctx.storage.list({ prefix: "event:" });
    const events = [];
    for (const record of listed.values()) {
      if (!record || Number(record.sequence) <= afterSequence) continue;
      if (workId && record.event?.workId !== workId) continue;
      events.push(clone(record));
      if (events.length >= limit) break;
    }
    return json({
      ok: true,
      workId: workId || null,
      afterSequence,
      events,
      lastSequence: Number((await this.ctx.storage.get("sequence")) ?? 0),
    });
  }

  async fetch(request) {
    try {
      if (request.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED" }, 405);
      const input = await request.json().catch(() => null);
      if (!input || typeof input !== "object" || Array.isArray(input)) return json({ code: "INVALID_JSON" }, 400);
      if (input.action === "append") return this.append(input.event);
      if (input.action === "history") return this.history(input);
      return json({ code: "GLOBAL_AUDIT_UNSUPPORTED_ACTION" }, 400);
    } catch (error) {
      return json({ code: error?.message || "GLOBAL_AUDIT_ERROR" }, error?.status || 400);
    }
  }
}

export function createGlobalAuditService({ namespace } = {}) {
  function stub() {
    if (!namespace || typeof namespace.getByName !== "function") return null;
    return namespace.getByName(GLOBAL_NAME);
  }
  return Object.freeze({
    configured() { return Boolean(stub()); },
    async append(event = {}) {
      const current = stub();
      if (!current || typeof current.fetch !== "function") return json({ code: "GLOBAL_AUDIT_NOT_CONFIGURED" }, 503);
      return current.fetch(new Request("https://global-audit.internal/append", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "append", event }),
      }));
    },
    async history(input = {}) {
      const current = stub();
      if (!current || typeof current.fetch !== "function") return json({ code: "GLOBAL_AUDIT_NOT_CONFIGURED" }, 503);
      return current.fetch(new Request("https://global-audit.internal/history", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "history", ...input }),
      }));
    },
  });
}
