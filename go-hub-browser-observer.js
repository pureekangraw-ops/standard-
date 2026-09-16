const SCHEMA_VERSION = "go-browser-observer-v1";
const DEFAULT_MAX_AGE_MS = 30_000;

function result(ok, code = null) {
  return { ok, code };
}

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function gumroadOrigin(value) {
  let url;
  try {
    url = new URL(clean(value));
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return url.protocol === "https:" && (host === "gumroad.com" || host.endsWith(".gumroad.com"));
}

function pathIsSanitized(value) {
  const path = clean(value);
  return path.startsWith("/") && !path.includes("?") && !path.includes("#") && !path.includes("\\");
}

function safeFields(fields) {
  if (!Array.isArray(fields)) return false;
  for (const field of fields) {
    if (!field || typeof field !== "object") return false;
    const sensitivity = clean(field.sensitivity).toLowerCase();
    const semantic = clean(field.semantic).toLowerCase();
    const kind = clean(field.field_kind).toLowerCase();
    if (sensitivity === "sensitive") return false;
    if (["password", "otp", "payment", "token", "cookie", "authorization", "file", "hidden"].includes(semantic)) return false;
    if (["password", "file", "hidden"].includes(kind)) return false;
    if (semantic === "unknown" && field.safe_value_or_state !== "UNKNOWN_REDACTED") return false;
    if (sensitivity === "unknown" && field.safe_value_or_state !== "UNKNOWN_REDACTED") return false;
  }
  return true;
}

export function validateObserverPacket(packet, serverSession, { now = Date.now(), maxAgeMs = DEFAULT_MAX_AGE_MS } = {}) {
  if (!packet || typeof packet !== "object" || packet.schema_version !== SCHEMA_VERSION) {
    return result(false, "SCHEMA_REJECTED");
  }
  if (!serverSession || serverSession.active !== true || clean(packet.session_id) !== clean(serverSession.sessionId)) {
    return result(false, "SESSION_INACTIVE");
  }
  const current = Number(now);
  if (!Number.isFinite(current) || !Number.isFinite(Number(serverSession.expiresAt)) || current >= Number(serverSession.expiresAt)) {
    return result(false, "SESSION_EXPIRED");
  }
  if (!gumroadOrigin(packet.origin) || clean(packet.origin) !== clean(serverSession.origin)) {
    return result(false, "HOST_BLOCKED");
  }
  if (!pathIsSanitized(packet.sanitized_path)) {
    return result(false, "SCHEMA_REJECTED");
  }
  const captured = Date.parse(clean(packet.captured_at));
  const maxAge = Number(maxAgeMs);
  if (!Number.isFinite(captured) || !Number.isFinite(maxAge) || maxAge < 0 || captured > current || current - captured > maxAge) {
    return result(false, "STALE_PAGE");
  }
  if (!clean(packet.page_fingerprint) || clean(packet.page_fingerprint) !== clean(serverSession.pageFingerprint)) {
    return result(false, "STALE_PAGE");
  }
  if (!safeFields(packet.fields)) {
    return result(false, "SENSITIVE_CONTENT_BLOCKED");
  }
  if (packet.optional_screenshot_ref != null && clean(packet.optional_screenshot_ref)) {
    if (serverSession.screenshotConsent !== true) return result(false, "SCREENSHOT_CONSENT_REQUIRED");
  }
  return result(true, null);
}

export function createObserverIngress({ now = () => Date.now(), maxAgeMs = DEFAULT_MAX_AGE_MS } = {}) {
  if (typeof now !== "function") throw new TypeError("now function required");
  return Object.freeze({
    validate(packet, serverSession) {
      return validateObserverPacket(packet, serverSession, { now: now(), maxAgeMs });
    },
  });
}

export { SCHEMA_VERSION, DEFAULT_MAX_AGE_MS };
