"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const safeFillUrl = pathToFileURL(path.join(root, "go-browser-safe-fill.js")).href;
const readerUrl = pathToFileURL(path.join(root, "go-browser-local-reader.js")).href;
const profilesUrl = pathToFileURL(path.join(root, "go-browser-site-profiles.js")).href;

async function load(tag) {
  const stamp = `${tag}=${Date.now()}-${Math.random()}`;
  const [safeFill, reader, profiles] = await Promise.all([
    import(`${safeFillUrl}?${stamp}`),
    import(`${readerUrl}?${stamp}`),
    import(`${profilesUrl}?${stamp}`),
  ]);
  return { ...safeFill, ...reader, ...profiles };
}

function fakeControl({
  tagName = "INPUT",
  type = "text",
  name = "",
  ariaLabel = "",
  value = "",
  readOnly = false,
  disabled = false,
  hidden = false,
  options = [],
  rejectWrites = false,
} = {}) {
  const attrs = new Map([
    ["type", type], ["name", name], ["aria-label", ariaLabel],
  ]);
  let stored = value;
  const events = [];
  const control = {
    tagName,
    type,
    name,
    readOnly,
    disabled,
    hidden,
    labels: [],
    options: options.map(option => ({ textContent: option, value: option })),
    checked: false,
    clickCount: 0,
    submitCount: 0,
    getAttribute(key) { return attrs.get(key) || null; },
    dispatchEvent(event) { events.push(event.type); return true; },
    click() { this.clickCount += 1; },
    submit() { this.submitCount += 1; },
    _events: events,
  };
  Object.defineProperty(control, "value", {
    enumerable: true,
    configurable: true,
    get() { return stored; },
    set(next) { if (!rejectWrites) stored = String(next); },
  });
  return control;
}

function fakeDocument(controls) {
  return {
    querySelectorAll(selector) {
      assert.equal(selector, 'input, textarea, select, [contenteditable="true"]');
      return controls;
    },
    getElementById() { return null; },
  };
}

function fakeWindow() {
  return {
    Event: class Event {
      constructor(type, init = {}) { this.type = type; this.bubbles = init.bubbles === true; }
    },
  };
}

function field(overrides = {}) {
  return {
    fieldId: "local:test:0",
    role: "textbox",
    name: "Product name",
    semanticRole: "title",
    valueKind: "text",
    sensitive: false,
    required: false,
    disabled: false,
    readOnly: false,
    hidden: false,
    options: [],
    signature: {
      role: "textbox",
      inputType: "text",
      accessibleName: "Product name",
      accessibleNameSource: "aria-label",
      accessibleNameStrength: "strong",
      name: "name",
      autocomplete: null,
      placeholder: null,
      contenteditable: false,
      options: [],
    },
    ...overrides,
  };
}

test("guard allows draft metadata and blocks sensitive unknown readonly hidden and unapproved semantics", async () => {
  const { guardAssignment, GUMROAD_PROFILE } = await load("guard");
  assert.deepEqual(guardAssignment(field(), GUMROAD_PROFILE), { allowed: true });
  assert.equal(guardAssignment(field({ semanticRole: "password", sensitive: true }), GUMROAD_PROFILE).code, "FIELD_SENSITIVE_BLOCKED");
  assert.equal(guardAssignment(field({ semanticRole: "unknown", name: "Mystery" }), GUMROAD_PROFILE).code, "FIELD_UNKNOWN_BLOCKED");
  assert.equal(guardAssignment(field({ readOnly: true }), GUMROAD_PROFILE).code, "FIELD_READONLY_BLOCKED");
  assert.equal(guardAssignment(field({ hidden: true }), GUMROAD_PROFILE).code, "FIELD_READONLY_BLOCKED");
  assert.equal(guardAssignment(field({ disabled: true }), GUMROAD_PROFILE).code, "FIELD_READONLY_BLOCKED");
  assert.equal(guardAssignment(field({ semanticRole: "email", name: "Email" }), GUMROAD_PROFILE).code, "UNSUPPORTED_FIELD_KIND");
  assert.equal(guardAssignment(field({ semanticRole: "title", name: "Publish product" }), GUMROAD_PROFILE).code, "FIELD_ACTION_BLOCKED");
});

test("Fill Plan binds assignments to scan fingerprint and refuses arbitrary commands", async () => {
  const { buildFillPlan } = await load("plan");
  const scan = { fingerprint: { id: "fp:12345678" }, fields: [field()] };
  const plan = buildFillPlan(scan, [{ fieldId: "local:test:0", value: "New title" }]);
  assert.equal(plan.fingerprintId, "fp:12345678");
  assert.equal(plan.assignments[0].semanticRole, "title");
  assert.equal(plan.assignments[0].expectedField.signature.name, "name");
  assert.equal(plan.assignments[0].value, "New title");
  assert.equal(Object.hasOwn(plan.assignments[0], "selector"), false);
  assert.throws(() => buildFillPlan(scan, [{ fieldId: "missing", value: "x" }]), /FIELD_NOT_FOUND/);
  assert.throws(() => buildFillPlan(scan, [{ fieldId: "local:test:0", value: "x", command: "click" }]), /INVALID_FILL_PLAN/);
});

test("resolver fails closed when current candidates are ambiguous", async () => {
  const { resolveField } = await load("ambiguous");
  const expected = field();
  const currentScan = {
    fields: [
      field({ fieldId: "a" }),
      field({ fieldId: "b" }),
    ],
  };
  assert.deepEqual(resolveField(currentScan, expected), { error: "FIELD_RESOLUTION_AMBIGUOUS" });
});

test("executeFillPlan writes nothing when page fingerprint changed", async () => {
  const { GUMROAD_PROFILE, scanLocalDocument, buildFillPlan, executeFillPlan } = await load("drift");
  const original = fakeControl({ name: "name", ariaLabel: "Product name", value: "Old" });
  const location = new URL("https://gumroad.com/products/new");
  const scan = scanLocalDocument({ document: fakeDocument([original]), location, title: "New product", profile: GUMROAD_PROFILE });
  const plan = buildFillPlan(scan, [{ fieldId: scan.fields[0].fieldId, value: "New" }]);

  const changed = fakeControl({ name: "description", ariaLabel: "Description", value: "Old body" });
  const receipt = executeFillPlan({
    document: fakeDocument([changed]), location, title: "New product", profile: GUMROAD_PROFILE, plan, window: fakeWindow(),
  });

  assert.equal(receipt.ok, false);
  assert.equal(receipt.code, "PAGE_CHANGED_RESCAN_REQUIRED");
  assert.equal(changed.value, "Old body");
  assert.deepEqual(changed._events, []);
});

test("executeFillPlan re-resolves, writes, dispatches normal events, reads back, and never clicks or submits", async () => {
  const { GUMROAD_PROFILE, scanLocalDocument, buildFillPlan, executeFillPlan } = await load("write");
  const title = fakeControl({ name: "name", ariaLabel: "Product name", value: "Old" });
  const price = fakeControl({ type: "number", name: "price", ariaLabel: "Price", value: "10" });
  const document = fakeDocument([title, price]);
  const location = new URL("https://gumroad.com/products/new");
  const scan = scanLocalDocument({ document, location, title: "New product", profile: GUMROAD_PROFILE });
  const plan = buildFillPlan(scan, [
    { fieldId: scan.fields[0].fieldId, value: "Safe title" },
    { fieldId: scan.fields[1].fieldId, value: 25 },
  ]);

  const result = executeFillPlan({ document, location, title: "New product", profile: GUMROAD_PROFILE, plan, window: fakeWindow() });

  assert.equal(result.ok, true);
  assert.equal(title.value, "Safe title");
  assert.equal(price.value, "25");
  assert.deepEqual(title._events, ["input", "change"]);
  assert.deepEqual(price._events, ["input", "change"]);
  assert.equal(title.clickCount + price.clickCount, 0);
  assert.equal(title.submitCount + price.submitCount, 0);
  assert.deepEqual(result.receipts.map(item => [item.semanticRole, item.state, item.actualValue]), [
    ["title", "VERIFIED", "Safe title"],
    ["price", "VERIFIED", "25"],
  ]);
});

test("read-back mismatch is FAILED rather than silent success", async () => {
  const { GUMROAD_PROFILE, scanLocalDocument, buildFillPlan, executeFillPlan } = await load("mismatch");
  const title = fakeControl({ name: "name", ariaLabel: "Product name", value: "Old", rejectWrites: true });
  const document = fakeDocument([title]);
  const location = new URL("https://gumroad.com/products/new");
  const scan = scanLocalDocument({ document, location, title: "New product", profile: GUMROAD_PROFILE });
  const plan = buildFillPlan(scan, [{ fieldId: scan.fields[0].fieldId, value: "Wanted" }]);
  const result = executeFillPlan({ document, location, title: "New product", profile: GUMROAD_PROFILE, plan, window: fakeWindow() });

  assert.equal(result.ok, false);
  assert.equal(result.receipts[0].state, "FAILED");
  assert.equal(result.receipts[0].code, "FIELD_VERIFY_MISMATCH");
  assert.equal(result.receipts[0].actualValue, "Old");
});
