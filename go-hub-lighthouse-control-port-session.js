const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SESSION_TTL_MS = DEFAULT_SESSION_TTL_MS;
const MAX_RECORDS = 200;
const MAX_STATE_CHARS = 750_000;
const SECRET_KEY = /(pin|password|recovery|vault|secret|token|passphrase)/i;
const encoder = new TextEncoder();

function clean(value) { return String(value == null ? "" : value).trim(); }
function clone(value) { return value == null ? value : structuredClone(value); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function containsSecret(value, seen = new Set()) {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) return true;
    if (containsSecret(nested, seen)) return true;
  }
  return false;
}
function requestId(value) {
  const id = clean(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) throw new Error("SCHEMA_REJECTED");
  return id;
}
function capabilityId(value) {
  const id = clean(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) throw new Error("SCHEMA_REJECTED");
  return id;
}
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(String(value || "")));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
function constantTimeEqual(left, right) {
  const a = encoder.encode(String(left || ""));
  const b = encoder.encode(String(right || ""));
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length, 1);
  for (let i = 0; i < len; i += 1) {
    diff |= (a[i % Math.max(a.length, 1)] || 0) ^ (b[i % Math.max(b.length, 1)] || 0);
  }
  return diff === 0;
}
function randomToken() {
  if (!globalThis.crypto?.getRandomValues) throw new Error("HUB_UNAVAILABLE");
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
function publicSession(session) {
  if (!session) return null;
  const { tokenHash, ...safe } = session;
  return clone(safe);
}
function newState() {
  return { schema:1, session:null, commands:{}, receipts:{}, latest:null };
}
function trimRecords(record) {
  const entries = Object.entries(record || {});
  return Object.fromEntries(entries.slice(Math.max(0, entries.length - MAX_RECORDS)));
}

export function createLighthouseControlPortSessionService({
  storage,
  now = () => Date.now(),
  randomUUID = () => crypto.randomUUID(),
  randomSessionToken = randomToken,
} = {}) {
  if (!storage || typeof storage.get !== "function" || typeof storage.put !== "function") {
    throw new TypeError("LIGHTHOUSE control-port storage required");
  }

  async function load() {
    const value = await storage.get("state");
    return value && value.schema === 1 ? value : newState();
  }
  async function save(state) {
    const next = clone(state);
    next.commands = trimRecords(next.commands);
    next.receipts = trimRecords(next.receipts);
    await storage.put("state", next);
    return next;
  }
  async function activeSession() {
    const state = await load();
    const session = state.session;
    if (!session || session.active !== true) return { ok:false, code:"SESSION_INACTIVE", state };
    const current = Number(now());
    if (!Number.isFinite(current) || current >= Number(session.expiresAt)) {
      state.session = { ...session, active:false };
      await save(state);
      return { ok:false, code:"SESSION_EXPIRED", state };
    }
    return { ok:true, session, state };
  }
  async function authorize({ sessionId, sessionToken } = {}) {
    const current = await activeSession();
    if (!current.ok) return current;
    if (clean(sessionId) !== clean(current.session.sessionId)) return { ok:false, code:"SESSION_INACTIVE", state:current.state };
    const supplied = await sha256(sessionToken);
    if (!constantTimeEqual(supplied, current.session.tokenHash)) return { ok:false, code:"SESSION_INACTIVE", state:current.state };
    return current;
  }

  return Object.freeze({
    async start({ deviceLabel = "LIGHTHOUSE Android", ttlMs = DEFAULT_SESSION_TTL_MS } = {}) {
      const ttl = Number(ttlMs);
      if (!Number.isFinite(ttl) || ttl <= 0 || ttl > MAX_SESSION_TTL_MS) return { ok:false, code:"SCHEMA_REJECTED" };
      const sessionId = clean(randomUUID());
      const token = clean(randomSessionToken());
      const startedAt = Number(now());
      if (!sessionId || !token || !Number.isFinite(startedAt)) return { ok:false, code:"HUB_UNAVAILABLE" };
      const state = newState();
      state.session = {
        sessionId,
        tokenHash:await sha256(token),
        active:true,
        deviceLabel:clean(deviceLabel).slice(0, 120) || "LIGHTHOUSE Android",
        startedAt,
        expiresAt:startedAt + ttl,
        lastSeenAt:null,
      };
      await save(state);
      return {
        ok:true,
        session_id:sessionId,
        session_token:token,
        expires_at:state.session.expiresAt,
        device_label:state.session.deviceLabel,
      };
    },

    async enqueue({ requestId:requestIdValue, capabilityId:capabilityIdValue, payload = {} } = {}) {
      const session = await activeSession();
      if (!session.ok) return { ok:false, code:session.code };
      const id = requestId(requestIdValue);
      const capId = capabilityId(capabilityIdValue);
      if (!payload || typeof payload !== "object" || Array.isArray(payload) || containsSecret(payload)) {
        return { ok:false, code:"SCHEMA_REJECTED" };
      }
      const existing = session.state.commands[id];
      if (existing) {
        if (existing.capabilityId !== capId || canonical(existing.payload) !== canonical(payload)) {
          return { ok:false, code:"REQUEST_ID_CONFLICT" };
        }
        return { ok:true, command:clone(existing), duplicate:true };
      }
      const command = {
        requestId:id,
        capabilityId:capId,
        payload:clone(payload),
        status:"QUEUED",
        queuedAt:new Date(Number(now())).toISOString(),
        deliveredAt:null,
      };
      session.state.commands[id] = command;
      await save(session.state);
      return { ok:true, command:clone(command), duplicate:false };
    },

    async pull(credentials = {}) {
      const auth = await authorize(credentials);
      if (!auth.ok) return { ok:false, code:auth.code };
      const pending = [];
      for (const command of Object.values(auth.state.commands)) {
        if (auth.state.receipts[command.requestId]) continue;
        command.status = "DELIVERED";
        command.deliveredAt = new Date(Number(now())).toISOString();
        pending.push(clone(command));
      }
      auth.state.session = { ...auth.session, lastSeenAt:Number(now()) };
      await save(auth.state);
      return { ok:true, commands:pending };
    },

    async pushReceipts({ sessionId, sessionToken, receipts } = {}) {
      const auth = await authorize({ sessionId, sessionToken });
      if (!auth.ok) return { ok:false, code:auth.code };
      if (!Array.isArray(receipts) || receipts.length > MAX_RECORDS) return { ok:false, code:"SCHEMA_REJECTED" };
      for (const receipt of receipts) {
        if (!receipt || typeof receipt !== "object" || Array.isArray(receipt) || containsSecret(receipt)) {
          return { ok:false, code:"SCHEMA_REJECTED" };
        }
        const id = requestId(receipt.requestId);
        if (!auth.state.commands[id]) return { ok:false, code:"COMMAND_NOT_FOUND" };
        auth.state.receipts[id] = clone(receipt);
        auth.state.commands[id] = { ...auth.state.commands[id], status:"RECEIPT", receiptAt:new Date(Number(now())).toISOString() };
      }
      auth.state.session = { ...auth.session, lastSeenAt:Number(now()) };
      await save(auth.state);
      return { ok:true, accepted:receipts.length };
    },

    async pushState({ sessionId, sessionToken, packet } = {}) {
      const auth = await authorize({ sessionId, sessionToken });
      if (!auth.ok) return { ok:false, code:auth.code };
      if (!packet || typeof packet !== "object" || Array.isArray(packet) || containsSecret(packet)) {
        return { ok:false, code:"SCHEMA_REJECTED" };
      }
      if (JSON.stringify(packet).length > MAX_STATE_CHARS) return { ok:false, code:"SCHEMA_REJECTED" };
      auth.state.latest = clone(packet);
      auth.state.session = { ...auth.session, lastSeenAt:Number(now()) };
      await save(auth.state);
      return { ok:true };
    },

    async latest() {
      const current = await activeSession();
      if (!current.ok) return { ok:false, code:current.code, session:publicSession(current.state?.session) };
      return {
        ok:true,
        session:publicSession(current.session),
        latest:clone(current.state.latest),
        commands:Object.values(current.state.commands).map(clone),
        receipts:Object.values(current.state.receipts).map(clone),
      };
    },

    async stop(credentials = {}) {
      const auth = await authorize(credentials);
      if (!auth.ok) return { ok:false, code:auth.code };
      auth.state.session = { ...auth.session, active:false, stoppedAt:Number(now()) };
      await save(auth.state);
      return { ok:true };
    },
  });
}

export class LighthouseControlPortSessionRegistry {
  constructor(ctx) { this.ctx = ctx; }
  service() { return createLighthouseControlPortSessionService({ storage:this.ctx.storage }); }
  async start(input) { return this.service().start(input); }
  async enqueue(input) { return this.service().enqueue(input); }
  async pull(input) { return this.service().pull(input); }
  async pushReceipts(input) { return this.service().pushReceipts(input); }
  async pushState(input) { return this.service().pushState(input); }
  async latest() { return this.service().latest(); }
  async stop(input) { return this.service().stop(input); }
}

export { DEFAULT_SESSION_TTL_MS, MAX_SESSION_TTL_MS };
