import { validateObserverPacket } from "./go-hub-browser-observer.js";

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const encoder = new TextEncoder();

function clean(value) { return String(value == null ? "" : value).trim(); }
function isGumroadOrigin(value) { try { const url = new URL(clean(value)); const host = url.hostname.toLowerCase(); return url.protocol === "https:" && (host === "gumroad.com" || host.endsWith(".gumroad.com")) && url.origin === clean(value); } catch { return false; } }
async function sha256(value) { const digest = await crypto.subtle.digest("SHA-256", encoder.encode(String(value || ""))); return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join(""); }
function constantTimeEqual(left, right) { const a = encoder.encode(String(left || "")); const b = encoder.encode(String(right || "")); let diff = a.length ^ b.length; const len = Math.max(a.length, b.length, 1); for (let i = 0; i < len; i += 1) diff |= (a[i % Math.max(a.length, 1)] || 0) ^ (b[i % Math.max(b.length, 1)] || 0); return diff === 0; }
function defaultToken() { if (!globalThis.crypto?.getRandomValues) throw new Error("HUB_UNAVAILABLE"); const bytes = new Uint8Array(32); crypto.getRandomValues(bytes); return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join(""); }
function publicSession(session) { if (!session) return null; const { tokenHash, ...safe } = session; return safe; }

export function createObserverSessionService({ storage, now = () => Date.now(), randomUUID = () => crypto.randomUUID(), randomToken = defaultToken } = {}) {
  if (!storage || typeof storage.get !== "function" || typeof storage.put !== "function") throw new TypeError("Observer session storage required");
  async function load(sessionId) { return storage.get(`session:${clean(sessionId)}`); }
  async function authorize(sessionId, sessionToken) {
    const session = await load(sessionId);
    if (!session || session.active !== true) return { ok: false, code: "SESSION_INACTIVE" };
    const current = Number(now());
    if (!Number.isFinite(current) || current >= Number(session.expiresAt)) return { ok: false, code: "SESSION_EXPIRED" };
    const suppliedHash = await sha256(sessionToken);
    if (!constantTimeEqual(suppliedHash, session.tokenHash)) return { ok: false, code: "SESSION_INACTIVE" };
    return { ok: true, session };
  }
  return Object.freeze({
    async start({ allowedOrigin, ttlMs = DEFAULT_TTL_MS } = {}) {
      const ttl = Number(ttlMs);
      if (!isGumroadOrigin(allowedOrigin)) return { ok: false, code: "HOST_BLOCKED" };
      if (!Number.isFinite(ttl) || ttl <= 0 || ttl > DEFAULT_TTL_MS) return { ok: false, code: "SCHEMA_REJECTED" };
      const sessionId = clean(randomUUID()); const token = clean(randomToken()); const startedAt = Number(now());
      if (!sessionId || !token || !Number.isFinite(startedAt)) return { ok: false, code: "HUB_UNAVAILABLE" };
      const session = { sessionId, tokenHash: await sha256(token), active: true, allowedOrigin, origin: null, pageFingerprint: null, startedAt, expiresAt: startedAt + ttl, screenshotConsent: false, latestScreenshotRef: null };
      await storage.put(`session:${sessionId}`, session);
      return { ok: true, session_id: sessionId, session_token: token, expires_at: session.expiresAt, allowed_origin: allowedOrigin };
    },
    async acceptSnapshot({ sessionId, sessionToken, packet } = {}) {
      const auth = await authorize(sessionId, sessionToken); if (!auth.ok) return auth;
      let session = auth.session;
      if (!session.origin || !session.pageFingerprint) {
        if (clean(packet?.origin) !== clean(session.allowedOrigin)) return { ok: false, code: "HOST_BLOCKED" };
        session = { ...session, origin: clean(packet.origin), pageFingerprint: clean(packet.page_fingerprint) };
      }
      const validated = validateObserverPacket(packet, session, { now: Number(now()) });
      if (!validated.ok) return validated;
      await storage.put(`session:${session.sessionId}`, session);
      await storage.put(`latest:${session.sessionId}`, packet);
      await storage.put("latest-session-id", session.sessionId);
      return { ok: true, code: null };
    },
    async read({ sessionId, sessionToken } = {}) {
      const auth = await authorize(sessionId, sessionToken); if (!auth.ok) return auth;
      return { ok: true, session: publicSession(auth.session), latest: await storage.get(`latest:${auth.session.sessionId}`) || null };
    },
    async stop({ sessionId, sessionToken } = {}) {
      const auth = await authorize(sessionId, sessionToken); if (!auth.ok) return auth;
      await storage.put(`session:${auth.session.sessionId}`, { ...auth.session, active: false, screenshotConsent: false });
      return { ok: true, code: null };
    },
    async grantScreenshot({ sessionId, sessionToken } = {}) {
      const auth = await authorize(sessionId, sessionToken); if (!auth.ok) return auth;
      await storage.put(`session:${auth.session.sessionId}`, { ...auth.session, screenshotConsent: true });
      return { ok: true, code: null };
    },
    async consumeScreenshot({ sessionId, sessionToken } = {}) {
      const auth = await authorize(sessionId, sessionToken); if (!auth.ok) return { allowed: false, code: auth.code };
      if (auth.session.screenshotConsent !== true) return { allowed: false, code: "SCREENSHOT_CONSENT_REQUIRED" };
      await storage.put(`session:${auth.session.sessionId}`, { ...auth.session, screenshotConsent: false });
      return { allowed: true, code: null };
    },
    async latest() {
      const sessionId = await storage.get("latest-session-id");
      if (!sessionId) return { ok: false, code: "SESSION_INACTIVE" };
      const session = await load(sessionId); const latest = await storage.get(`latest:${sessionId}`) || null;
      if (!session || session.active !== true || Number(now()) >= Number(session.expiresAt)) return { ok: false, code: session ? "SESSION_EXPIRED" : "SESSION_INACTIVE" };
      return { ok: true, session: publicSession(session), latest };
    },
  });
}

export class ObserverSessionRegistry {
  constructor(ctx) { this.ctx = ctx; }
  service() { return createObserverSessionService({ storage: this.ctx.storage }); }
  async start(input) { return this.service().start(input); }
  async acceptSnapshot(input) { return this.service().acceptSnapshot(input); }
  async read(input) { return this.service().read(input); }
  async stop(input) { return this.service().stop(input); }
  async grantScreenshot(input) { return this.service().grantScreenshot(input); }
  async consumeScreenshot(input) { return this.service().consumeScreenshot(input); }
  async latest() { return this.service().latest(); }
}

export { DEFAULT_TTL_MS };
