const UI_STATE = Object.freeze({ OFF: "OFF", OBSERVING: "OBSERVING", EXPIRED: "EXPIRED" });

function node(documentObject, tag, text, className = "") {
  const element = documentObject.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function button(documentObject, label) {
  const element = documentObject.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.className = "go-observer-button";
  return element;
}

export function mountObserverPanel({ observer, document: documentObject = globalThis.document, location: locationObject = globalThis.location, window: windowObject = globalThis.window, runtime = globalThis.browser?.runtime, now = () => Date.now() } = {}) {
  if (!observer || !documentObject?.body || !runtime || !locationObject || !windowObject) return null;
  if (documentObject.getElementById("go-observer-root")) return null;
  let state = UI_STATE.OFF;
  let session = null;
  let lastPacket = null;
  const root = documentObject.createElement("section");
  root.id = "go-observer-root";
  root.setAttribute("aria-label", "GO Browser Local Observer Eye");
  const title = node(documentObject, "strong", "GO Eye");
  const status = node(documentObject, "span", state, "go-observer-status");
  const message = node(documentObject, "span", "Observer is off", "go-observer-message");
  const start = button(documentObject, "Start Observer");
  const stop = button(documentObject, "Stop Observer");
  const observe = button(documentObject, "Observe now");
  const screenshot = button(documentObject, "One screenshot");
  function setState(next, text) { state = next; status.textContent = next; message.textContent = text; }
  function snapshot() {
    const result = observer.collectObserverSnapshot({ document: documentObject, location: locationObject, title: documentObject.title, viewport: { width: windowObject.innerWidth, height: windowObject.innerHeight }, session, now: now() });
    if (!result.ok) {
      if (result.code === "SESSION_EXPIRED") setState(UI_STATE.EXPIRED, result.code);
      else message.textContent = result.code;
      return result;
    }
    lastPacket = result.packet;
    message.textContent = `Observed ${result.packet.fields.length} visible fields · HUB_UNAVAILABLE until governed Hub origin is configured`;
    return result;
  }
  start.addEventListener("click", () => {
    session = observer.createObserverSession({ sessionId: globalThis.crypto?.randomUUID?.() || `session-${now()}`, startedAt: now(), ttlMs: 10 * 60 * 1000, origin: locationObject.origin });
    lastPacket = null;
    setState(UI_STATE.OBSERVING, "Owner-started session active");
  });
  stop.addEventListener("click", () => { session = observer.stopObserverSession(session); lastPacket = null; setState(UI_STATE.OFF, "Observer stopped"); });
  observe.addEventListener("click", () => { snapshot(); });
  screenshot.addEventListener("click", async () => {
    const observed = snapshot();
    if (!observed.ok) return;
    if ((observed.packet.redaction_report?.sensitive_blocked || 0) > 0) { message.textContent = "SENSITIVE_CONTENT_BLOCKED"; return; }
    session = observer.grantScreenshotConsent(session, now());
    const consent = observer.consumeScreenshotConsent(session, now());
    session = consent.session;
    if (!consent.allowed) { message.textContent = consent.code; return; }
    const result = await runtime.sendMessage({ type: "GO_OBSERVER_SCREENSHOT", consentGranted: true, safeToCapture: true, pageFingerprint: lastPacket?.page_fingerprint || null });
    message.textContent = result?.ok ? "One screenshot captured locally" : (result?.code || "SENSITIVE_CONTENT_BLOCKED");
  });
  root.append(title, status, message, start, stop, observe, screenshot);
  documentObject.body.append(root);
  return Object.freeze({ root, getState: () => state });
}

export { UI_STATE };
