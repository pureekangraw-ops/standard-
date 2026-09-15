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

function signature(overrides = {}) {
  return {
    role: "textbox",
    inputType: "text",
    accessibleName: "Product name",
    accessibleNameSource: "aria-label",
    accessibleNameStrength: "strong",
    name: "name",
    autocomplete: "off",
    placeholder: "Name",
    contenteditable: false,
    options: [],
    ...overrides,
  };
}

function field(overrides = {}) {
  return {
    fieldId: "local:expected:0",
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
    signature: signature(),
    ...overrides,
  };
}

function fakeControl({ tagName = "INPUT", type = "text", name = "", ariaLabel = "", value = "", options = [], contenteditable = false } = {}) {
  const attrs = new Map([["type", type], ["name", name], ["aria-label", ariaLabel]]);
  if (contenteditable) attrs.set("contenteditable", "true");
  const events = [];
  return {
    tagName,
    type,
    name,
    value,
    required: false,
    disabled: false,
    readOnly: false,
    hidden: false,
    checked: false,
    labels: [],
    options: options.map(option => ({ textContent: option, value: option })),
    textContent: contenteditable ? value : "",
    getAttribute(key) { return attrs.get(key) || null; },
    dispatchEvent(event) { events.push(event.type); return true; },
    _events: events,
  };
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
  return { Event: class Event { constructor(type, init = {}) { this.type = type; this.bubbles = init.bubbles === true; } } };
}

test("resolver scoring uses the locked V1 evidence weights and confidence margin", async () => {
  const { scoreCandidate, resolveField } = await load("weights");
  const expected = field();
  const exact = field({ fieldId: "exact" });
  assert.equal(scoreCandidate(expected, exact), 18);
  assert.equal(resolveField({ fields: [exact] }, expected).field.fieldId, "exact");

  const weak = field({
    fieldId: "weak",
    role: "searchbox",
    signature: signature({ role: "searchbox", inputType: "search", name: null, autocomplete: null, options: ["x"] }),
  });
  assert.equal(scoreCandidate(expected, weak) < 7, true);
  assert.deepEqual(resolveField({ fields: [weak] }, expected), { error: "FIELD_NOT_FOUND" });

  const nearA = field({ fieldId: "near-a", signature: signature({ placeholder: "Other" }) });
  const nearB = field({ fieldId: "near-b", signature: signature({ placeholder: "Another" }) });
  assert.deepEqual(resolveField({ fields: [nearA, nearB] }, expected), { error: "FIELD_RESOLUTION_AMBIGUOUS" });
});

test("contenteditable remains blocked until it has a dedicated safe write contract", async () => {
  const { guardAssignment, GUMROAD_PROFILE } = await load("contenteditable");
  const contenteditable = field({ signature: signature({ contenteditable: true }) });
  assert.deepEqual(guardAssignment(contenteditable, GUMROAD_PROFILE), { allowed: false, code: "UNSUPPORTED_FIELD_KIND" });
});

test("file and action input types are blocked by kind even when mislabeled as safe metadata", async () => {
  const { guardAssignment, GUMROAD_PROFILE } = await load("blocked-kinds");
  for (const inputType of ["file", "submit", "button", "reset", "image"]) {
    const candidate = field({ signature: signature({ inputType }) });
    const result = guardAssignment(candidate, GUMROAD_PROFILE);
    assert.equal(result.allowed, false, `${inputType} must not be writable`);
    assert.equal(["UNSUPPORTED_FIELD_KIND", "FIELD_ACTION_BLOCKED"].includes(result.code), true);
  }
});

test("choice writer blocks values absent from current select options and writes nothing", async () => {
  const { GUMROAD_PROFILE, scanLocalDocument, buildFillPlan, executeFillPlan } = await load("choice");
  const select = fakeControl({ tagName: "SELECT", name: "category", ariaLabel: "Category", value: "Course", options: ["Course", "Digital Product"] });
  const document = fakeDocument([select]);
  const location = new URL("https://gumroad.com/products/new");
  const scan = scanLocalDocument({ document, location, title: "New product", profile: GUMROAD_PROFILE });
  const plan = buildFillPlan(scan, [{ fieldId: scan.fields[0].fieldId, value: "Forbidden option" }]);
  const result = executeFillPlan({ document, location, title: "New product", profile: GUMROAD_PROFILE, plan, window: fakeWindow() });

  assert.equal(result.ok, false);
  assert.equal(result.receipts[0].state, "BLOCKED");
  assert.equal(result.receipts[0].code, "UNSUPPORTED_FIELD_KIND");
  assert.equal(select.value, "Course");
  assert.deepEqual(select._events, []);
});
