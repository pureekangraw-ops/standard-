"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = pathToFileURL(path.join(root, "go-hub-browser-interface.js")).href;

function browserResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function loadModule(tag) {
  return import(`${moduleUrl}?${tag}=${Date.now()}`);
}

test("Browser Interface reads an allowed rendered page and maps semantic fields", async () => {
  const calls = [];
  const browser = {
    async quickAction(action, options) {
      calls.push({ action, options });
      return browserResponse({
        success: true,
        result: {
          markdown: "# New product",
          accessibilityTree: {
            role: "RootWebArea",
            name: "Create product",
            children: [
              { role: "textbox", name: "Product name", required: true },
              { role: "textbox", name: "Description" },
              { role: "spinbutton", name: "Price" },
              { role: "combobox", name: "Category", children: [
                { role: "option", name: "Digital Product" },
                { role: "option", name: "Course" },
              ] },
            ],
          },
        },
        meta: { title: "Create product" },
      });
    },
  };

  const { createBrowserInterface } = await loadModule("read");
  const service = createBrowserInterface({ browser });
  const response = await service.readPage({
    url: "https://shop.example.com/product/new",
    allowedHostnames: ["shop.example.com"],
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{
    action: "snapshot",
    options: {
      url: "https://shop.example.com/product/new",
      formats: ["markdown", "accessibilityTree"],
      gotoOptions: { waitUntil: "domcontentloaded", timeout: 30000 },
    },
  }]);

  const payload = await response.json();
  assert.equal(payload.hostname, "shop.example.com");
  assert.equal(payload.title, "Create product");
  assert.equal(payload.pageEvidence.markdown, "# New product");
  assert.equal(payload.fields.length, 4);
  assert.deepEqual(payload.fields.map(field => ({
    role: field.role,
    semanticRole: field.semanticRole,
    riskClass: field.riskClass,
    required: field.required,
  })), [
    { role: "textbox", semanticRole: "title", riskClass: "SAFE_READ", required: true },
    { role: "textbox", semanticRole: "description", riskClass: "SAFE_READ", required: false },
    { role: "spinbutton", semanticRole: "price", riskClass: "SAFE_READ", required: false },
    { role: "combobox", semanticRole: "category", riskClass: "SAFE_READ", required: false },
  ]);
  assert.deepEqual(payload.fields[3].options, ["Digital Product", "Course"]);
  assert.match(payload.fields[0].fieldId, /^field:/);
});

test("Browser Interface blocks disallowed hosts before Browser Run", async () => {
  let called = false;
  const browser = { async quickAction() { called = true; return browserResponse({}); } };
  const { createBrowserInterface } = await loadModule("host");
  const service = createBrowserInterface({ browser });

  const response = await service.readPage({
    url: "https://evil.example.net/form",
    allowedHostnames: ["shop.example.com", "*.assets.example.com"],
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { code: "BROWSER_HOST_NOT_ALLOWED" });
  assert.equal(called, false);
});

test("Browser Interface allows declared wildcard subdomains but not the wildcard root", async () => {
  const calls = [];
  const browser = {
    async quickAction(action, options) {
      calls.push({ action, options });
      return browserResponse({ success: true, result: { accessibilityTree: { role: "RootWebArea", name: "ok" }, markdown: "ok" } });
    },
  };
  const { createBrowserInterface } = await loadModule("wildcard");
  const service = createBrowserInterface({ browser });

  const subdomain = await service.readPage({
    url: "https://cdn.assets.example.com/form",
    allowedHostnames: ["*.assets.example.com"],
  });
  const rootDomain = await service.readPage({
    url: "https://assets.example.com/form",
    allowedHostnames: ["*.assets.example.com"],
  });

  assert.equal(subdomain.status, 200);
  assert.equal(rootDomain.status, 403);
  assert.equal(calls.length, 1);
});

test("Browser Interface marks password OTP and payment fields sensitive and preserves unknowns", async () => {
  const browser = {
    async quickAction() {
      return browserResponse({
        success: true,
        result: {
          markdown: "Sensitive form",
          accessibilityTree: {
            role: "RootWebArea",
            name: "Sensitive form",
            children: [
              { role: "textbox", name: "Password" },
              { role: "textbox", name: "OTP code" },
              { role: "textbox", name: "Card number" },
              { role: "textbox", name: "Whatever this is" },
            ],
          },
        },
      });
    },
  };
  const { createBrowserInterface } = await loadModule("risk");
  const response = await createBrowserInterface({ browser }).readPage({
    url: "https://secure.example.com/form",
    allowedHostnames: ["secure.example.com"],
  });
  const payload = await response.json();

  assert.deepEqual(payload.fields.map(field => [field.semanticRole, field.riskClass]), [
    ["password", "SENSITIVE"],
    ["otp", "SENSITIVE"],
    ["payment", "SENSITIVE"],
    ["unknown", "UNKNOWN"],
  ]);
  assert.equal(payload.unknowns.length, 1);
  assert.equal(payload.unknowns[0].name, "Whatever this is");
});

test("Browser Interface fails closed for invalid URL protocol and missing binding", async () => {
  const { createBrowserInterface } = await loadModule("closed");

  const invalid = await createBrowserInterface({ browser: { quickAction() {} } }).readPage({
    url: "file:///tmp/form.html",
    allowedHostnames: ["example.com"],
  });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { code: "INVALID_BROWSER_PROTOCOL" });

  const missing = await createBrowserInterface({ browser: null }).readPage({
    url: "https://example.com/form",
    allowedHostnames: ["example.com"],
  });
  assert.equal(missing.status, 503);
  assert.deepEqual(await missing.json(), { code: "BROWSER_NOT_CONFIGURED" });
});
