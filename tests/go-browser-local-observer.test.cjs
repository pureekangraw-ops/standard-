"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const observerPath = path.join(root, "go-browser-local-observer.js");
const observerUrl = pathToFileURL(observerPath).href;

async function load(tag) {
  assert.equal(fs.existsSync(observerPath), true, "Observer runtime is not implemented yet");
  return import(`${observerUrl}?observer=${tag}-${Date.now()}`);
}

function control({
  tagName = "INPUT",
  type = "text",
  label = "",
  value = "",
  checked = false,
  hidden = false,
  contenteditable = false,
  autocomplete = "",
  name = "",
  width = 100,
  height = 20,
} = {}) {
  const attributes = new Map();
  if (label) attributes.set("aria-label", label);
  if (contenteditable) attributes.set("contenteditable", "true");
  if (autocomplete) attributes.set("autocomplete", autocomplete);
  if (name) attributes.set("name", name);
  return {
    tagName,
    type,
    value,
    textContent: contenteditable ? value : "",
    checked,
    hidden,
    disabled: false,
    readOnly: false,
    required: false,
    labels: [],
    options: [],
    getAttribute(key) { return attributes.has(key) ? attributes.get(key) : null; },
    getBoundingClientRect() { return { width, height, top: 0, left: 0, bottom: height, right: width }; },
  };
}

function documentWith(controls, title = "Gumroad product") {
  return {
    title,
    querySelectorAll(selector) {
      assert.match(selector, /input/);
      return controls;
    },
    getElementById() { return null; },
  };
}

function activeSession(observer, overrides = {}) {
  return observer.createObserverSession({
    sessionId: "session-1",
    startedAt: 1_000,
    ttlMs: 60_000,
    origin: "https://gumroad.com",
    ...overrides,
  });
}

function collect(observer, { controls = [], session = activeSession(observer), now = 2_000, href = "https://gumroad.com/products/demo?token=secret#frag" } = {}) {
  return observer.collectObserverSnapshot({
    document: documentWith(controls),
    location: new URL(href),
    title: "Edit product",
    viewport: { width: 390, height: 844 },
    session,
    now,
  });
}

test("no active owner session blocks evidence", async () => {
  const observer = await load("inactive");
  const result = collect(observer, { session: null });
  assert.deepEqual(result, { ok: false, code: "SESSION_INACTIVE" });
});

test("expired session blocks evidence", async () => {
  const observer = await load("expired");
  const session = activeSession(observer, { startedAt: 1_000, ttlMs: 500 });
  assert.deepEqual(collect(observer, { session, now: 2_000 }), { ok: false, code: "SESSION_EXPIRED" });
});

test("host outside Gumroad allowlist is blocked", async () => {
  const observer = await load("host");
  assert.deepEqual(collect(observer, { href: "https://example.com/product" }), { ok: false, code: "HOST_BLOCKED" });
});

test("query string and fragment never leave the local observer", async () => {
  const observer = await load("path");
  const result = collect(observer);
  assert.equal(result.ok, true);
  assert.equal(result.packet.origin, "https://gumroad.com");
  assert.equal(result.packet.sanitized_path, "/products/demo");
  assert.equal(JSON.stringify(result.packet).includes("token=secret"), false);
  assert.equal(JSON.stringify(result.packet).includes("frag"), false);
});

test("password OTP payment token hidden and file values never appear in output", async () => {
  const observer = await load("sensitive");
  const controls = [
    control({ type: "password", label: "Password", value: "pw-secret" }),
    control({ label: "Verification code", autocomplete: "one-time-code", value: "123456" }),
    control({ label: "Card number", autocomplete: "cc-number", value: "4111111111111111" }),
    control({ label: "Access token", value: "tok-secret" }),
    control({ type: "hidden", label: "Hidden", value: "hidden-secret", hidden: true }),
    control({ type: "file", label: "Upload", value: "/private/file.txt" }),
  ];
  const result = collect(observer, { controls });
  assert.equal(result.ok, true);
  const serialized = JSON.stringify(result.packet);
  for (const secret of ["pw-secret", "123456", "4111111111111111", "tok-secret", "hidden-secret", "/private/file.txt"]) {
    assert.equal(serialized.includes(secret), false, `leaked sensitive value: ${secret}`);
  }
});

test("unknown fields export metadata only with UNKNOWN_REDACTED", async () => {
  const observer = await load("unknown");
  const result = collect(observer, { controls: [control({ label: "Mystery", value: "must-not-leak" })] });
  assert.equal(result.ok, true);
  assert.equal(result.packet.fields.length, 1);
  assert.equal(result.packet.fields[0].label, "Mystery");
  assert.equal(result.packet.fields[0].safe_value_or_state, "UNKNOWN_REDACTED");
  assert.equal(result.packet.fields[0].sensitivity, "unknown");
  assert.equal(JSON.stringify(result.packet).includes("must-not-leak"), false);
});

test("Gumroad fixture reads Name Description Price and visible boolean state", async () => {
  const observer = await load("gumroad");
  const result = collect(observer, { controls: [
    control({ label: "Name", name: "name", value: "Lost Era" }),
    control({ tagName: "DIV", label: "Description", value: "Reality fracture", contenteditable: true }),
    control({ type: "number", label: "Price", value: "9" }),
    control({ type: "checkbox", label: "Published", checked: true }),
  ] });
  assert.equal(result.ok, true);
  const fields = Object.fromEntries(result.packet.fields.map(field => [field.label, field]));
  assert.equal(fields.Name.safe_value_or_state, "Lost Era");
  assert.equal(fields.Description.safe_value_or_state, "Reality fracture");
  assert.equal(fields.Price.safe_value_or_state, "9");
  assert.equal(fields.Published.safe_value_or_state, true);
});

test("zero-size or hidden controls are omitted", async () => {
  const observer = await load("visible");
  const result = collect(observer, { controls: [
    control({ label: "Name", value: "Visible" }),
    control({ label: "Description", value: "Invisible", width: 0, height: 0 }),
    control({ label: "Price", value: "99", hidden: true }),
  ] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.packet.fields.map(field => field.label), ["Name"]);
});

test("stopping a session blocks transmission immediately", async () => {
  const observer = await load("stop");
  const stopped = observer.stopObserverSession(activeSession(observer));
  assert.deepEqual(collect(observer, { session: stopped }), { ok: false, code: "SESSION_INACTIVE" });
});

test("screenshot consent is one-shot and requires an active session", async () => {
  const observer = await load("screenshot");
  const session = activeSession(observer);
  const withoutConsent = observer.consumeScreenshotConsent(session, 2_000);
  assert.equal(withoutConsent.allowed, false);
  assert.equal(withoutConsent.code, "SCREENSHOT_CONSENT_REQUIRED");

  const granted = observer.grantScreenshotConsent(session, 2_000);
  const first = observer.consumeScreenshotConsent(granted, 2_001);
  assert.equal(first.allowed, true);
  const second = observer.consumeScreenshotConsent(first.session, 2_002);
  assert.equal(second.allowed, false);
  assert.equal(second.code, "SCREENSHOT_CONSENT_REQUIRED");
});

test("transport is fixed to GO Hub and blocks any other destination", async () => {
  const observer = await load("destination");
  const sent = [];
  const transport = observer.createObserverTransport({
    hubOrigin: "https://hub.example",
    fetchImpl: async (url, init) => { sent.push({ url, init }); return new Response("{}", { status: 200 }); },
  });
  const blocked = await transport.send({ destination: "https://evil.example/collect", packet: {} });
  assert.deepEqual(blocked, { ok: false, code: "DESTINATION_BLOCKED" });
  assert.equal(sent.length, 0);
});

test("Hub network failure returns HUB_UNAVAILABLE without fallback", async () => {
  const observer = await load("hub-down");
  let calls = 0;
  const transport = observer.createObserverTransport({
    hubOrigin: "https://hub.example",
    fetchImpl: async () => { calls += 1; throw new Error("offline"); },
  });
  const result = await transport.send({ destination: "https://hub.example/hub/api/browser/observer/snapshot", packet: {} });
  assert.deepEqual(result, { ok: false, code: "HUB_UNAVAILABLE" });
  assert.equal(calls, 1);
});

test("Observer public API contains no action primitive", async () => {
  const observer = await load("api");
  const forbidden = /click|type|fill|submit|publish|purchase|navigate|eval/i;
  assert.deepEqual(Object.keys(observer).filter(key => forbidden.test(key)), []);
});
