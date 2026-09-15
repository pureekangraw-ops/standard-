"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const workerUrl = pathToFileURL(path.join(root, "go-hub-worker.mjs")).href;

function browserResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function loadWorker(tag) {
  return import(`${workerUrl}?browser=${tag}-${Date.now()}`);
}

test("Worker browser route reads a page without GitHub credentials", async () => {
  const calls = [];
  const BROWSER = {
    async quickAction(action, options) {
      calls.push({ action, options });
      return browserResponse({
        success: true,
        result: {
          markdown: "# Product",
          accessibilityTree: {
            role: "RootWebArea",
            name: "Product editor",
            children: [{ role: "textbox", name: "Product name", required: true }],
          },
        },
      });
    },
  };
  const { createWorkerHandler } = await loadWorker("read");
  const handler = createWorkerHandler();
  const request = new Request("https://hub.example/hub/api/browser/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: "https://shop.example.com/product/new",
      allowedHostnames: ["shop.example.com"],
    }),
  });

  const response = await handler.fetch(request, { BROWSER });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.hostname, "shop.example.com");
  assert.equal(payload.fields.length, 1);
  assert.equal(payload.fields[0].semanticRole, "title");
  assert.equal(calls.length, 1);
});

test("Worker browser route fails closed when Browser Run is not configured", async () => {
  const { createWorkerHandler } = await loadWorker("missing");
  const handler = createWorkerHandler();
  const request = new Request("https://hub.example/hub/api/browser/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: "https://shop.example.com/product/new",
      allowedHostnames: ["shop.example.com"],
    }),
  });

  const response = await handler.fetch(request, {});
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: "BROWSER_NOT_CONFIGURED" });
});

test("Worker browser route rejects invalid JSON before browser execution", async () => {
  let called = false;
  const BROWSER = { async quickAction() { called = true; return browserResponse({}); } };
  const { createWorkerHandler } = await loadWorker("json");
  const handler = createWorkerHandler();
  const request = new Request("https://hub.example/hub/api/browser/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });

  const response = await handler.fetch(request, { BROWSER });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { code: "INVALID_JSON" });
  assert.equal(called, false);
});

test("Worker browser API rejects unsupported methods and paths", async () => {
  const { createWorkerHandler } = await loadWorker("not-found");
  const handler = createWorkerHandler();
  const getResponse = await handler.fetch(new Request("https://hub.example/hub/api/browser/read"), { BROWSER: {} });
  const unknownResponse = await handler.fetch(new Request("https://hub.example/hub/api/browser/unknown", { method: "POST" }), { BROWSER: {} });

  assert.equal(getResponse.status, 404);
  assert.deepEqual(await getResponse.json(), { code: "NOT_FOUND" });
  assert.equal(unknownResponse.status, 404);
  assert.deepEqual(await unknownResponse.json(), { code: "NOT_FOUND" });
});
