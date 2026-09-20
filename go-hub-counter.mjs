const ANSWER_STATES = Object.freeze(["ANSWERED", "WAIT", "UNKNOWN", "NEEDS_INPUT", "FAILED", "EXPIRED"]);
const ANSWER_STATE_SET = new Set(ANSWER_STATES);
const CONTINUABLE_ANSWER_STATES = new Set(["SEEN", "WAIT", "NEEDS_INPUT"]);
const NON_TERMINAL_ANSWER_STATES = new Set(["WAIT", "NEEDS_INPUT"]);
const SECRET_FIELD = /(authorization|token|secret|passcode|master.?key)/i;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function required(value, label) {
  const text = String(value || "").trim();
  if (!text) throw Object.assign(new Error(label + " is required"), { status: 400 });
  return text;
}

function stringList(value, label) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw Object.assign(new Error(label + " must be an array"), { status: 400 });
  return value.map(item => required(item, label + " item"));
}

function objectValue(value, label, { optional = false } = {}) {
  if (value == null && optional) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw Object.assign(new Error(label + " must be an object"), { status: 400 });
  }
  return clone(value);
}

function objectList(value, label) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw Object.assign(new Error(label + " must be an array"), { status: 400 });
  return value.map((item, index) => objectValue(item, label + "[" + index + "]"));
}

function rejectSecrets(value, path = "root") {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_FIELD.test(key)) {
      throw Object.assign(new Error("SECRET_FIELD_REJECTED:" + path + "." + key), { status: 400 });
    }
    rejectSecrets(nested, path + "." + key);
  }
}

function workIdentity(input = {}) {
  const workContext = objectValue(input.workContext, "workContext");
  return {
    workId: required(workContext.workId, "workContext.workId"),
    checkpointId: required(workContext.checkpointId, "workContext.checkpointId"),
  };
}

function assertIdentity(state, input) {
  const identity = workIdentity(input);
  if (identity.workId !== state.workId || identity.checkpointId !== state.checkpointId) {
    throw Object.assign(new Error("COUNTER_WORK_IDENTITY_MISMATCH"), { status: 409 });
  }
  const counterId = required(input.counterId, "Counter ID");
  if (counterId !== state.counterId) {
    throw Object.assign(new Error("COUNTER_ID_MISMATCH"), { status: 409 });
  }
}

function appendEvent(state, type, actor, at, detail = null) {
  const nextSequence = state.events.length + 1;
  state.events.push({
    sequence: nextSequence,
    type,
    actor,
    at,
    ...(detail == null ? {} : { detail: clone(detail) }),
  });
}

function publicState(state, extra = {}) {
  return {
    ok: true,
    counter: clone(state),
    ...extra,
  };
}

export function createCounterCore({ now = () => new Date().toISOString() } = {}) {
  if (typeof now !== "function") throw new TypeError("now must be a function");

  function create(input = {}, current = null) {
    rejectSecrets(input);
    const identity = workIdentity(input);
    const counterId = required(input.counterId, "Counter ID");
    const request = required(input.request, "Request");
    const context = objectValue(input.context, "Context", { optional: true });
    const sourceHints = stringList(input.sourceHints, "Source hints");
    const doNotChange = stringList(input.doNotChange, "Do not change");

    if (current) {
      if (current.counterId !== counterId ||
          current.workId !== identity.workId ||
          current.checkpointId !== identity.checkpointId) {
        throw Object.assign(new Error("COUNTER_ALREADY_EXISTS"), { status: 409 });
      }
      if (current.request !== request) {
        throw Object.assign(new Error("COUNTER_REQUEST_MISMATCH"), { status: 409 });
      }
      return publicState(current, { idempotent: true });
    }

    const at = now();
    const state = {
      counterId,
      revision: 1,
      workId: identity.workId,
      checkpointId: identity.checkpointId,
      from: "GO",
      to: "LIGHT",
      request,
      context,
      sourceHints,
      doNotChange,
      currentState: "OPEN",
      createdAt: at,
      seenAt: null,
      answeredAt: null,
      readBackAt: null,
      closedAt: null,
      answer: null,
      sources: [],
      evidence: [],
      confidence: null,
      nextRoute: null,
      events: [],
    };
    appendEvent(state, "OPEN", "GO", at, { request });
    return publicState(state, { created: true });
  }

  function get(input = {}, current = null) {
    if (!current) throw Object.assign(new Error("COUNTER_NOT_FOUND"), { status: 404 });
    assertIdentity(current, input);
    return publicState(current);
  }

  function seen(input = {}, current = null) {
    if (!current) throw Object.assign(new Error("COUNTER_NOT_FOUND"), { status: 404 });
    rejectSecrets(input);
    assertIdentity(current, input);
    if (current.events.some(item => item.type === "SEEN")) {
      return publicState(current, { idempotent: true });
    }
    if (current.currentState !== "OPEN") {
      throw Object.assign(new Error("COUNTER_INVALID_TRANSITION:" + current.currentState + "->SEEN"), { status: 409 });
    }
    const state = clone(current);
    const at = now();
    state.revision += 1;
    state.currentState = "SEEN";
    state.seenAt = at;
    appendEvent(state, "SEEN", "LIGHT", at);
    return publicState(state);
  }

  function answer(input = {}, current = null) {
    if (!current) throw Object.assign(new Error("COUNTER_NOT_FOUND"), { status: 404 });
    rejectSecrets(input);
    assertIdentity(current, input);
    const status = required(input.status, "Answer status").toUpperCase();
    if (!ANSWER_STATE_SET.has(status)) {
      throw Object.assign(new Error("COUNTER_INVALID_ANSWER_STATUS"), { status: 400 });
    }
    const answerText = required(input.answer, "Answer");
    const sources = stringList(input.sources, "Sources");
    const evidence = objectList(input.evidence, "Evidence");
    const confidence = input.confidence == null ? null : String(input.confidence);
    const nextRoute = input.nextRoute == null ? null : String(input.nextRoute).trim() || null;

    if (current.currentState === status &&
        current.answer === answerText &&
        JSON.stringify(current.sources) === JSON.stringify(sources) &&
        JSON.stringify(current.evidence) === JSON.stringify(evidence)) {
      return publicState(current, { idempotent: true });
    }
    if (!CONTINUABLE_ANSWER_STATES.has(current.currentState)) {
      throw Object.assign(new Error("COUNTER_INVALID_TRANSITION:" + current.currentState + "->" + status), { status: 409 });
    }
    if (status === "ANSWERED" && (sources.length === 0 || evidence.length === 0)) {
      throw Object.assign(new Error("COUNTER_ANSWER_REQUIRES_SOURCE_AND_EVIDENCE"), { status: 400 });
    }

    const state = clone(current);
    const at = now();
    state.revision += 1;
    state.currentState = status;
    state.answeredAt = at;
    state.answer = answerText;
    state.sources = sources;
    state.evidence = evidence;
    state.confidence = confidence;
    state.nextRoute = nextRoute;
    appendEvent(state, status, "LIGHT", at, {
      sources: sources.length,
      evidence: evidence.length,
      nextRoute,
    });
    return publicState(state);
  }

  function readback(input = {}, current = null) {
    if (!current) throw Object.assign(new Error("COUNTER_NOT_FOUND"), { status: 404 });
    rejectSecrets(input);
    assertIdentity(current, input);

    if (current.currentState === "CLOSED" && current.events.some(item => item.type === "READBACK")) {
      return publicState(current, { idempotent: true });
    }

    const legacyReadbackState = current.currentState === "READBACK";
    if (!ANSWER_STATE_SET.has(current.currentState) && !legacyReadbackState) {
      throw Object.assign(new Error("COUNTER_INVALID_TRANSITION:" + current.currentState + "->READBACK"), { status: 409 });
    }

    const evidence = objectValue(input.evidence, "Readback evidence");
    if (Object.keys(evidence).length === 0) {
      throw Object.assign(new Error("COUNTER_READBACK_EVIDENCE_REQUIRED"), { status: 400 });
    }

    const closeRequested =
      input.close === true ||
      (input.close !== false && !NON_TERMINAL_ANSWER_STATES.has(current.currentState));

    const latestReadback = [...current.events].reverse().find(item => item.type === "READBACK");
    if (!closeRequested &&
        latestReadback &&
        JSON.stringify(latestReadback.detail || {}) === JSON.stringify(evidence)) {
      return publicState(current, { idempotent: true });
    }

    const state = clone(current);
    const at = now();
    state.revision += 1;
    state.readBackAt = at;
    appendEvent(state, "READBACK", "GO", at, evidence);

    if (closeRequested) {
      state.currentState = "CLOSED";
      state.closedAt = at;
      appendEvent(state, "CLOSED", "HUB", at, { priorState: current.currentState });
    }
    return publicState(state);
  }

  return Object.freeze({ create, get, seen, answer, readback });
}

export class GoHubCounterState {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.core = createCounterCore();
  }

  async load() {
    return (await this.ctx.storage.get("counter")) || null;
  }

  async save(state) {
    await this.ctx.storage.put("counter", clone(state));
    const readback = await this.ctx.storage.get("counter");
    if (JSON.stringify(readback) !== JSON.stringify(state)) {
      throw Object.assign(new Error("COUNTER_DURABLE_READBACK_MISMATCH"), { status: 500 });
    }
  }

  async act(input = {}) {
    const action = required(input.action, "Counter action").toLowerCase();
    const current = await this.load();
    if (action === "get") return this.core.get(input, current);

    const result = action === "create" ? this.core.create(input, current)
      : action === "seen" ? this.core.seen(input, current)
      : action === "answer" ? this.core.answer(input, current)
      : action === "readback" ? this.core.readback(input, current)
      : (() => { throw Object.assign(new Error("COUNTER_ACTION_UNSUPPORTED"), { status: 400 }); })();

    if (!result.idempotent) await this.save(result.counter);
    return result;
  }

  async fetch(request) {
    try {
      if (request.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED" }, 405);
      const input = await request.json().catch(() => null);
      if (!input || typeof input !== "object" || Array.isArray(input)) return json({ code: "INVALID_JSON" }, 400);
      return json(await this.act(input));
    } catch (error) {
      return json({ code: error?.message || "COUNTER_ERROR" }, error?.status || 400);
    }
  }
}

function counterStub(namespace, counterId) {
  if (!namespace || typeof namespace.getByName !== "function") return null;
  return namespace.getByName(counterId);
}

export function createCounterService({ namespace } = {}) {
  async function call(action, input = {}) {
    const counterId = required(input.counterId, "Counter ID");
    const stub = counterStub(namespace, counterId);
    if (!stub || typeof stub.fetch !== "function") return json({ code: "COUNTER_STATE_NOT_CONFIGURED" }, 503);
    return stub.fetch(new Request("https://counter-state.internal/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, action }),
    }));
  }

  return Object.freeze({
    create: input => call("create", input),
    get: input => call("get", input),
    seen: input => call("seen", input),
    answer: input => call("answer", input),
    readback: input => call("readback", input),
  });
}
