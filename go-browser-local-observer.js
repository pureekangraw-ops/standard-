const OBSERVER_SCHEMA_VERSION = "go-browser-observer-v1";
const GUMROAD_HOSTS = Object.freeze(["gumroad.com", "*.gumroad.com"]);
const CANDIDATE_SELECTOR = 'input, textarea, select, [contenteditable="true"]';
const SCREENSHOT_CONSENT_TTL_MS = 30_000;

export const OBSERVER_STATUS = Object.freeze({
  SESSION_INACTIVE: "SESSION_INACTIVE",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  HOST_BLOCKED: "HOST_BLOCKED",
  SENSITIVE_CONTENT_BLOCKED: "SENSITIVE_CONTENT_BLOCKED",
  FIELD_UNKNOWN_REDACTED: "FIELD_UNKNOWN_REDACTED",
  STALE_PAGE: "STALE_PAGE",
  SCHEMA_REJECTED: "SCHEMA_REJECTED",
  SCREENSHOT_CONSENT_REQUIRED: "SCREENSHOT_CONSENT_REQUIRED",
  DESTINATION_BLOCKED: "DESTINATION_BLOCKED",
  HUB_UNAVAILABLE: "HUB_UNAVAILABLE",
});

function cleanText(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function stableHash(text) {
  let hash = 2166136261;
  for (const ch of String(text)) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function hostnameMatches(hostname, pattern) {
  const host = cleanText(hostname).toLowerCase();
  const policy = cleanText(pattern).toLowerCase();
  if (!host || !policy) return false;
  if (!policy.startsWith("*.")) return host === policy;
  const suffix = policy.slice(2);
  return Boolean(suffix) && host !== suffix && host.endsWith(`.${suffix}`);
}

function isGumroadHost(hostname) {
  return GUMROAD_HOSTS.some(pattern => hostnameMatches(hostname, pattern));
}

export function sanitizePath(value) {
  const url = value instanceof URL ? value : new URL(String(value || ""));
  const pathname = String(url.pathname || "/").replace(/\/{2,}/g, "/");
  return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
}

function sessionStatus(session, now) {
  if (!session || session.active !== true) return OBSERVER_STATUS.SESSION_INACTIVE;
  if (!Number.isFinite(session.expiresAt) || Number(now) >= session.expiresAt) {
    return OBSERVER_STATUS.SESSION_EXPIRED;
  }
  return null;
}

export function createObserverSession({ sessionId, startedAt, ttlMs, origin } = {}) {
  const id = cleanText(sessionId);
  const started = Number(startedAt);
  const ttl = Number(ttlMs);
  const parsedOrigin = new URL(String(origin || ""));
  if (!id || !Number.isFinite(started) || !Number.isFinite(ttl) || ttl <= 0) {
    throw new TypeError("VALID_OBSERVER_SESSION_REQUIRED");
  }
  if (parsedOrigin.protocol !== "https:" || !isGumroadHost(parsedOrigin.hostname)) {
    throw new Error(OBSERVER_STATUS.HOST_BLOCKED);
  }
  return Object.freeze({
    sessionId: id,
    startedAt: started,
    expiresAt: started + ttl,
    origin: parsedOrigin.origin,
    active: true,
    screenshotConsent: false,
    screenshotGrantedAt: null,
  });
}

export function stopObserverSession(session) {
  if (!session) return null;
  return Object.freeze({
    ...session,
    active: false,
    screenshotConsent: false,
    screenshotGrantedAt: null,
  });
}

export function grantScreenshotConsent(session, now = Date.now()) {
  const status = sessionStatus(session, now);
  if (status) return session;
  return Object.freeze({
    ...session,
    screenshotConsent: true,
    screenshotGrantedAt: Number(now),
  });
}

export function consumeScreenshotConsent(session, now = Date.now()) {
  const status = sessionStatus(session, now);
  if (status) return { allowed: false, code: status, session };
  const grantedAt = Number(session.screenshotGrantedAt);
  const fresh = session.screenshotConsent === true && Number.isFinite(grantedAt) &&
    Number(now) - grantedAt >= 0 && Number(now) - grantedAt <= SCREENSHOT_CONSENT_TTL_MS;
  if (!fresh) {
    return { allowed: false, code: OBSERVER_STATUS.SCREENSHOT_CONSENT_REQUIRED, session };
  }
  return {
    allowed: true,
    code: null,
    session: Object.freeze({
      ...session,
      screenshotConsent: false,
      screenshotGrantedAt: null,
    }),
  };
}

function accessibleLabel(document, element) {
  const aria = cleanText(element?.getAttribute?.("aria-label"));
  if (aria) return aria;
  const labels = Array.from(element?.labels || []).map(item => cleanText(item?.textContent)).find(Boolean);
  if (labels) return labels;
  const labelledBy = cleanText(element?.getAttribute?.("aria-labelledby"));
  if (labelledBy) {
    const value = labelledBy.split(/\s+/).map(id => cleanText(document?.getElementById?.(id)?.textContent)).filter(Boolean).join(" ");
    if (value) return value;
  }
  const name = cleanText(element?.name || element?.getAttribute?.("name"));
  if (name) return name;
  return cleanText(element?.getAttribute?.("placeholder"));
}

function inputType(element) {
  return cleanText(element?.type || element?.getAttribute?.("type") || "text").toLowerCase();
}

function isVisible(element) {
  if (!element || element.hidden === true) return false;
  if (element.getAttribute?.("aria-hidden") === "true") return false;
  if (inputType(element) === "hidden") return false;
  const rect = typeof element.getBoundingClientRect === "function" ? element.getBoundingClientRect() : null;
  if (rect && (!(Number(rect.width) > 0) || !(Number(rect.height) > 0))) return false;
  return true;
}

function classifySensitivity(element, label) {
  const type = inputType(element);
  const autocomplete = cleanText(element?.getAttribute?.("autocomplete")).toLowerCase();
  const normalized = cleanText(label).toLowerCase();
  if (type === "hidden") return "sensitive";
  if (type === "file") return "sensitive";
  if (type === "password") return "sensitive";
  if (autocomplete.split(/\s+/).includes("one-time-code")) return "sensitive";
  if (autocomplete.split(/\s+/).some(token => token.startsWith("cc-") || token === "transaction-amount")) return "sensitive";
  if (/password|passcode|\botp\b|one[- ]?time|verification code|card number|credit card|debit card|\bcvv\b|\bcvc\b|bank|account number|authorization|bearer|access token|refresh token|api key|secret|cookie|session token|recovery code/.test(normalized)) {
    return "sensitive";
  }
  return "candidate";
}

function classifySemantic(label, element) {
  const normalized = cleanText(label).toLowerCase();
  const type = inputType(element);
  if (type === "checkbox" || type === "radio") return "visible_state";
  if (normalized === "name" || /\btitle\b|product name|item name/.test(normalized)) return "title";
  if (/\bdescription\b|details|summary/.test(normalized)) return "description";
  if (/\bprice\b|amount|cost/.test(normalized)) return "price";
  if (/\bcategory\b|product type/.test(normalized)) return "category";
  if (/\btags?\b|keywords?/.test(normalized)) return "tags";
  if (/published|enabled|active|visible|toggle/.test(normalized)) return "visible_state";
  return "unknown";
}

function fieldKind(element) {
  const tag = String(element?.tagName || "").toUpperCase();
  const type = inputType(element);
  if (type === "checkbox" || type === "radio") return type;
  if (tag === "SELECT") return "choice";
  if (element?.getAttribute?.("contenteditable") === "true") return "contenteditable";
  if (tag === "TEXTAREA") return "textarea";
  if (type === "number" || type === "range") return "number";
  return "text";
}

function safeValue(element, semantic) {
  if (semantic === "unknown") return "UNKNOWN_REDACTED";
  const type = inputType(element);
  if (type === "checkbox" || type === "radio") return Boolean(element?.checked);
  if (element?.getAttribute?.("contenteditable") === "true") return String(element?.textContent || "");
  return element?.value == null ? "" : String(element.value);
}

function captureFields(document) {
  const output = [];
  let sensitiveBlocked = 0;
  let unknownRedacted = 0;
  let hiddenOmitted = 0;
  const signatures = [];

  for (const element of Array.from(document.querySelectorAll(CANDIDATE_SELECTOR))) {
    if (!isVisible(element)) {
      hiddenOmitted += 1;
      continue;
    }
    const label = accessibleLabel(document, element);
    const sensitivity = classifySensitivity(element, label);
    if (sensitivity === "sensitive") {
      sensitiveBlocked += 1;
      continue;
    }
    const semantic = classifySemantic(label, element);
    const kind = fieldKind(element);
    const signature = { label, semantic, field_kind: kind };
    signatures.push(signature);
    if (semantic === "unknown") unknownRedacted += 1;
    output.push(Object.freeze({
      label,
      field_kind: kind,
      semantic,
      safe_value_or_state: safeValue(element, semantic),
      confidence: semantic === "unknown" ? "low" : "high",
      sensitivity: semantic === "unknown" ? "unknown" : "safe",
      status: semantic === "unknown" ? OBSERVER_STATUS.FIELD_UNKNOWN_REDACTED : "SAFE_READ",
    }));
  }

  return {
    fields: Object.freeze(output),
    signatures,
    redactionReport: Object.freeze({
      sensitive_blocked: sensitiveBlocked,
      unknown_redacted: unknownRedacted,
      hidden_omitted: hiddenOmitted,
    }),
  };
}

function capturedAt(now) {
  const value = Number(now);
  return new Date(Number.isFinite(value) ? value : Date.now()).toISOString();
}

export function collectObserverSnapshot({ document, location, title = "", viewport = {}, session, now = Date.now() } = {}) {
  const status = sessionStatus(session, now);
  if (status) return { ok: false, code: status };
  const url = location instanceof URL ? location : new URL(String(location?.href || location || ""));
  if ((url.protocol !== "https:" && url.protocol !== "http:") || !isGumroadHost(url.hostname) || url.origin !== session.origin) {
    return { ok: false, code: OBSERVER_STATUS.HOST_BLOCKED };
  }
  if (!document || typeof document.querySelectorAll !== "function") {
    return { ok: false, code: OBSERVER_STATUS.SCHEMA_REJECTED };
  }

  const sanitizedPath = sanitizePath(url);
  const captured = captureFields(document);
  const fingerprintSource = JSON.stringify({
    origin: url.origin,
    path: sanitizedPath,
    title: cleanText(title),
    signatures: captured.signatures,
  });
  const pageFingerprint = `obsfp:${stableHash(fingerprintSource)}`;

  return {
    ok: true,
    packet: Object.freeze({
      schema_version: OBSERVER_SCHEMA_VERSION,
      session_id: session.sessionId,
      captured_at: capturedAt(now),
      origin: url.origin,
      sanitized_path: sanitizedPath,
      page_title: cleanText(title),
      viewport: Object.freeze({ width: Number(viewport.width) || 0, height: Number(viewport.height) || 0 }),
      page_fingerprint: pageFingerprint,
      visible_landmarks: Object.freeze([]),
      visible_text_snippets: Object.freeze([]),
      interactive_elements: Object.freeze(captured.fields.map(field => Object.freeze({ label: field.label, field_kind: field.field_kind, semantic: field.semantic }))),
      fields: captured.fields,
      redaction_report: captured.redactionReport,
      optional_screenshot_ref: null,
    }),
  };
}

export function createObserverTransport({ hubOrigin, fetchImpl = globalThis.fetch } = {}) {
  const origin = new URL(String(hubOrigin || ""));
  if (origin.protocol !== "https:") throw new TypeError("HTTPS_GO_HUB_ORIGIN_REQUIRED");
  const allowedDestination = new URL("/hub/api/browser/observer/snapshot", origin).toString();
  if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation required");

  return Object.freeze({
    async send({ destination, packet } = {}) {
      let target;
      try {
        target = new URL(String(destination || "")).toString();
      } catch {
        return { ok: false, code: OBSERVER_STATUS.DESTINATION_BLOCKED };
      }
      if (target !== allowedDestination) {
        return { ok: false, code: OBSERVER_STATUS.DESTINATION_BLOCKED };
      }
      try {
        const response = await fetchImpl(target, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(packet || {}),
        });
        if (!response || response.ok !== true) return { ok: false, code: OBSERVER_STATUS.HUB_UNAVAILABLE };
        return { ok: true, code: null };
      } catch {
        return { ok: false, code: OBSERVER_STATUS.HUB_UNAVAILABLE };
      }
    },
  });
}

export { OBSERVER_SCHEMA_VERSION, GUMROAD_HOSTS, SCREENSHOT_CONSENT_TTL_MS };
