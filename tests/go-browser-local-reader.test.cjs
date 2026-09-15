"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const profilesUrl = pathToFileURL(path.join(root, "go-browser-site-profiles.js")).href;
const readerUrl = pathToFileURL(path.join(root, "go-browser-local-reader.js")).href;

async function loadModules(tag) {
  const stamp = `${tag}=${Date.now()}-${Math.random()}`;
  const profiles = await import(`${profilesUrl}?${stamp}`);
  const reader = await import(`${readerUrl}?${stamp}`);
  return { ...profiles, ...reader };
}

function fakeControl({
  tagName = "INPUT",
  type = "text",
  name = "",
  value = "",
  ariaLabel = "",
  ariaLabelledby = "",
  label = "",
  placeholder = "",
  autocomplete = "",
  required = false,
  disabled = false,
  readOnly = false,
  hidden = false,
  contenteditable = null,
  options = [],
} = {}) {
  const attrs = new Map([
    ["type", type],
    ["name", name],
    ["aria-label", ariaLabel],
    ["aria-labelledby", ariaLabelledby],
    ["placeholder", placeholder],
    ["autocomplete", autocomplete],
  ]);
  if (contenteditable !== null) attrs.set("contenteditable", contenteditable);
  return {
    tagName,
    type,
    name,
    value,
    required,
    disabled,
    readOnly,
    hidden,
    labels: label ? [{ textContent: label }] : [],
    options: options.map(option => ({ textContent: option, value: option })),
    textContent: tagName === "DIV" ? value : "",
    getAttribute(key) {
      return attrs.get(key) || null;
    },
  };
}

function fakeDocument(controls, labelledText = {}) {
  return {
    querySelectorAll(selector) {
      assert.equal(selector, "input, textarea, select, [contenteditable=\"true\"]");
      return controls;
    },
    getElementById(id) {
      return Object.hasOwn(labelledText, id) ? { textContent: labelledText[id] } : null;
    },
  };
}

test("Gumroad is the only V1 site profile", async () => {
  const { profileForUrl } = await loadModules("profile");
  assert.equal(profileForUrl("https://example.com/form"), null);
  assert.equal(profileForUrl("https://gumroad.com/products/new").id, "gumroad-v1");
  assert.equal(profileForUrl("https://app.gumroad.com/products/new").id, "gumroad-v1");
  assert.equal(profileForUrl("file:///tmp/form"), null);
});

test("scan derives semantic signatures and structural fingerprint without child-index locators", async () => {
  const { GUMROAD_PROFILE, scanLocalDocument } = await loadModules("scan");
  const document = fakeDocument([
    fakeControl({ tagName: "INPUT", type: "text", name: "name", ariaLabel: "Product name", value: "Old title" }),
    fakeControl({ tagName: "TEXTAREA", name: "description", label: "Description", value: "Old body" }),
    fakeControl({ tagName: "INPUT", type: "number", name: "price", label: "Price", value: "10" }),
  ]);
  const result = scanLocalDocument({
    document,
    location: new URL("https://gumroad.com/products/new/"),
    title: "New product",
    profile: GUMROAD_PROFILE,
  });

  assert.deepEqual(result.fields.map(field => field.semanticRole), ["title", "description", "price"]);
  assert.equal(result.fields[0].signature.accessibleName, "Product name");
  assert.equal(result.fields[0].signature.name, "name");
  assert.equal(Object.hasOwn(result.fields[0].signature, "childIndex"), false);
  assert.equal(result.page.pathname, "/products/new");
  assert.match(result.fingerprint.id, /^fp:[0-9a-f]{8}$/);
  assert.equal(result.fingerprint.algorithm, "go-browser-fingerprint-v1");
  assert.deepEqual(result.unknowns, []);
});

test("scan preserves sensitive unknown hidden disabled and readonly evidence", async () => {
  const { GUMROAD_PROFILE, scanLocalDocument } = await loadModules("risk");
  const document = fakeDocument([
    fakeControl({ type: "password", name: "password", ariaLabel: "Password" }),
    fakeControl({ name: "verification", ariaLabel: "Verification code", autocomplete: "one-time-code" }),
    fakeControl({ name: "card", ariaLabel: "Card number", autocomplete: "cc-number" }),
    fakeControl({ name: "mystery", ariaLabel: "Whatever this is" }),
    fakeControl({ name: "hidden-title", ariaLabel: "Product name", hidden: true }),
    fakeControl({ name: "locked-description", ariaLabel: "Description", readOnly: true }),
    fakeControl({ name: "disabled-price", ariaLabel: "Price", disabled: true }),
  ]);
  const result = scanLocalDocument({
    document,
    location: new URL("https://gumroad.com/products/new"),
    title: "New product",
    profile: GUMROAD_PROFILE,
  });

  assert.deepEqual(result.fields.slice(0, 4).map(field => [field.semanticRole, field.sensitive]), [
    ["password", true],
    ["otp", true],
    ["payment", true],
    ["unknown", false],
  ]);
  assert.equal(result.fields[4].hidden, true);
  assert.equal(result.fields[5].readOnly, true);
  assert.equal(result.fields[6].disabled, true);
  assert.equal(result.unknowns.length, 1);
  assert.equal(result.unknowns[0].name, "Whatever this is");
});

test("fingerprint changes for meaningful field structure changes, not current values", async () => {
  const { GUMROAD_PROFILE, scanLocalDocument } = await loadModules("fingerprint");
  const location = new URL("https://gumroad.com/products/new");
  const first = scanLocalDocument({
    document: fakeDocument([fakeControl({ name: "name", ariaLabel: "Product name", value: "A" })]),
    location,
    title: "New product",
    profile: GUMROAD_PROFILE,
  });
  const changedValue = scanLocalDocument({
    document: fakeDocument([fakeControl({ name: "name", ariaLabel: "Product name", value: "B" })]),
    location,
    title: "New product",
    profile: GUMROAD_PROFILE,
  });
  const changedStructure = scanLocalDocument({
    document: fakeDocument([fakeControl({ name: "description", ariaLabel: "Description", value: "A" })]),
    location,
    title: "New product",
    profile: GUMROAD_PROFILE,
  });

  assert.equal(first.fingerprint.id, changedValue.fingerprint.id);
  assert.notEqual(first.fingerprint.id, changedStructure.fingerprint.id);
});
