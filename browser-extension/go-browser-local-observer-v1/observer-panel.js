const UI_STATE = Object.freeze({ OFF: "OFF", OBSERVING: "OBSERVING", EXPIRED: "EXPIRED" });

function node(documentObject, tag, text, className = "") { const element = documentObject.createElement(tag); element.textContent = text; if (className) element.className = className; return element; }
function button(documentObject, label) { const element = documentObject.createElement("button"); element.type = "button"; element.textContent = label; element.className = "go-observer-button"; return element; }

export function mountObserverPanel({ observer, document: documentObject = globalThis.document, location: locationObject = globalThis.location, window: windowObject = globalThis.window, runtime = globalThis.browser?.runtime, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  if (!observer || !documentObject?.body || !runtime || !locationObject || !windowObject) return null;
  if (documentObject.getElementById("go-observer-root")) return null;
  let state = UI_STATE.OFF; let session = null; let transport = null; let lastPacket = null;
  const root = documentObject.createElement("section"); root.id = "go-observer-root"; root.setAttribute("aria-label", "GO Browser Local Observer Eye");
  const title = node(documentObject, "strong", "GO Eye"); const status = node(documentObject, "span", state, "go-observer-status"); const message = node(documentObject, "span", "Observer is off", "go-observer-message");
  const bootstrapLabel = node(documentObject, "label", "GO Hub bootstrap"); const bootstrapInput = documentObject.createElement("textarea"); bootstrapInput.rows = 4; bootstrapInput.placeholder = "Paste bootstrap code from GO Hub /hub/observer"; bootstrapInput.className = "go-observer-bootstrap"; bootstrapLabel.append(bootstrapInput);
  const start = button(documentObject, "Start Observer"); const stop = button(documentObject, "Stop Observer"); const observe = button(documentObject, "Observe now"); const screenshot = button(documentObject, "One screenshot");
  function setState(next, text) { state = next; status.textContent = next; message.textContent = text; }
  function snapshot() {
    const result = observer.collectObserverSnapshot({ document: documentObject, location: locationObject, title: documentObject.title, viewport: { width: windowObject.innerWidth, height: windowObject.innerHeight }, session, now: now() });
    if (!result.ok) { if (result.code === "SESSION_EXPIRED") setState(UI_STATE.EXPIRED, result.code); else message.textContent = result.code; return result; }
    lastPacket = result.packet; return result;
  }
  async function sendSnapshot() {
    const observed = snapshot(); if (!observed.ok) return observed;
    if (!transport) { message.textContent = "SESSION_INACTIVE"; return { ok: false, code: "SESSION_INACTIVE" }; }
    const sent = await transport.sendSnapshot(observed.packet);
    if (!sent.ok) { if (sent.code === "SESSION_EXPIRED") setState(UI_STATE.EXPIRED, sent.code); else message.textContent = sent.code; return sent; }
    message.textContent = `Sent ${observed.packet.fields.length} visible fields to GO Hub`;
    return { ok: true, packet: observed.packet };
  }
  start.addEventListener("click", () => {
    try {
      const bootstrap = observer.parseObserverBootstrap(bootstrapInput.value, now());
      if (bootstrap.allowedOrigin !== locationObject.origin) { message.textContent = "HOST_BLOCKED"; return; }
      const ttlMs = bootstrap.expiresAt - Number(now());
      session = observer.createObserverSession({ sessionId: bootstrap.sessionId, startedAt: now(), ttlMs, origin: bootstrap.allowedOrigin });
      transport = observer.createObserverTransport({ bootstrap, fetchImpl });
      bootstrapInput.value = ""; lastPacket = null; setState(UI_STATE.OBSERVING, "Owner-started GO Hub session active");
    } catch (error) { setState(UI_STATE.OFF, error?.message || "SCHEMA_REJECTED"); }
  });
  stop.addEventListener("click", async () => {
    const remote = transport ? await transport.stop() : { ok: false, code: "SESSION_INACTIVE" };
    session = observer.stopObserverSession(session); transport = null; lastPacket = null;
    setState(UI_STATE.OFF, remote.ok ? "Observer stopped on device and GO Hub" : (remote.code || "Observer stopped locally"));
  });
  observe.addEventListener("click", async () => { await sendSnapshot(); });
  screenshot.addEventListener("click", async () => {
    const observed = await sendSnapshot(); if (!observed.ok) return;
    if ((observed.packet.redaction_report?.sensitive_blocked || 0) > 0) { message.textContent = "SENSITIVE_CONTENT_BLOCKED"; return; }
    const remoteConsent = await transport.grantScreenshotConsent(); if (!remoteConsent.ok) { message.textContent = remoteConsent.code; return; }
    session = observer.grantScreenshotConsent(session, now()); const consent = observer.consumeScreenshotConsent(session, now()); session = consent.session;
    if (!consent.allowed) { message.textContent = consent.code; return; }
    const result = await runtime.sendMessage({ type: "GO_OBSERVER_SCREENSHOT", consentGranted: true, safeToCapture: true, pageFingerprint: lastPacket?.page_fingerprint || null });
    message.textContent = result?.ok ? "One screenshot captured locally · upload gate next" : (result?.code || "SENSITIVE_CONTENT_BLOCKED");
  });
  root.append(title, status, message, bootstrapLabel, start, stop, observe, screenshot); documentObject.body.append(root);
  return Object.freeze({ root, getState: () => state });
}

export { UI_STATE };
