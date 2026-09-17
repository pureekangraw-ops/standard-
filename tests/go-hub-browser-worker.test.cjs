"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const workerUrl = pathToFileURL(path.join(root, "go-hub-edge-worker.mjs")).href;

function browserResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function browserWorkContext(overrides = {}) {
  return {
    workId: "WORK-BROWSER-1",
    checkpointId: "CENTRE-BROWSER-1",
    returnAddress: "CENTRE-BROWSER-1",
    destination: "destination://browser",
    task: "Read browser reality",
    requestedResult: "Return page evidence",
    lensReference: "lens://browser-reality",
    ...overrides,
  };
}

function routedBody(url, extra = {}) {
  return { url, workContext: browserWorkContext(), ...extra };
}

function browserEnv(browser, allowedHostnames = ["shop.example.com"]) {
  return {
    BROWSER: browser,
    BROWSER_POLICY: { allowedHostnames },
  };
}

async function loadWorker(tag) {
  return import(`${workerUrl}?browser=${tag}-${Date.now()}`);
}

test("Edge browser route reads a server-authorized page with exact Browser work context", async () => {
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
  const { createEdgeWorkerHandler } = await loadWorker("read");
  const handler = createEdgeWorkerHandler();
  const request = new Request("https://hub.example/hub/api/browser/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(routedBody("https://shop.example.com/product/new")),
  });

  const response = await handler.fetch(request, browserEnv(BROWSER));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.hostname, "shop.example.com");
  assert.equal(payload.fields.length, 1);
  assert.equal(payload.fields[0].semanticRole, "title");
  assert.equal(calls.length, 1);
});

test("Edge browser route rejects missing, wrong-destination, and mismatched-return work context", async () => {
  let calls = 0;
  const BROWSER = { async quickAction() { calls += 1; return browserResponse({}); } };
  const { createEdgeWorkerHandler } = await loadWorker("route-context");
  const handler = createEdgeWorkerHandler();
  const env = browserEnv(BROWSER);

  for (const body of [
    { url: "https://shop.example.com/product/new" },
    routedBody("https://shop.example.com/product/new", { workContext: browserWorkContext({ destination: "destination://factory" }) }),
    routedBody("https://shop.example.com/product/new", { workContext: browserWorkContext({ returnAddress: "CENTRE-OTHER" }) }),
  ]) {
    const response = await handler.fetch(new Request("https://hub.example/hub/api/browser/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }), env);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { code: "INVALID_BROWSER_WORK_CONTEXT" });
  }
  assert.equal(calls, 0);
});

test("Edge browser route ignores a caller-supplied allowlist and enforces server policy", async () => {
  let called = false;
  const BROWSER = { async quickAction() { called = true; return browserResponse({}); } };
  const { createEdgeWorkerHandler } = await loadWorker("policy");
  const handler = createEdgeWorkerHandler();
  const request = new Request("https://hub.example/hub/api/browser/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(routedBody("https://evil.example.net/form", {
      allowedHostnames: ["evil.example.net"],
    })),
  });

  const response = await handler.fetch(request, browserEnv(BROWSER, ["shop.example.com"]));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { code: "BROWSER_HOST_NOT_ALLOWED" });
  assert.equal(called, false);
});

test("Edge browser route fails closed when server host policy is missing", async () => {
  let called = false;
  const BROWSER = { async quickAction() { called = true; return browserResponse({}); } };
  const { createEdgeWorkerHandler } = await loadWorker("policy-missing");
  const handler = createEdgeWorkerHandler();
  const request = new Request("https://hub.example/hub/api/browser/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(routedBody("https://shop.example.com/product/new")),
  });

  const response = await handler.fetch(request, { BROWSER });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: "BROWSER_POLICY_NOT_CONFIGURED" });
  assert.equal(called, false);
});

test("Edge browser route fails closed when Browser Run is not configured", async () => {
  const { createEdgeWorkerHandler } = await loadWorker("missing");
  const handler = createEdgeWorkerHandler();
  const request = new Request("https://hub.example/hub/api/browser/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(routedBody("https://shop.example.com/product/new")),
  });

  const response = await handler.fetch(request, {
    BROWSER_POLICY: { allowedHostnames: ["shop.example.com"] },
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: "BROWSER_NOT_CONFIGURED" });
});

test("Edge browser route rejects invalid JSON before browser execution", async () => {
  let called = false;
  const BROWSER = { async quickAction() { called = true; return browserResponse({}); } };
  const { createEdgeWorkerHandler } = await loadWorker("json");
  const handler = createEdgeWorkerHandler();
  const request = new Request("https://hub.example/hub/api/browser/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });

  const response = await handler.fetch(request, browserEnv(BROWSER));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { code: "INVALID_JSON" });
  assert.equal(called, false);
});

test("Edge browser API rejects unsupported methods and paths", async () => {
  const { createEdgeWorkerHandler } = await loadWorker("not-found");
  const handler = createEdgeWorkerHandler();
  const env = browserEnv({});
  const getResponse = await handler.fetch(new Request("https://hub.example/hub/api/browser/read"), env);
  const unknownResponse = await handler.fetch(new Request("https://hub.example/hub/api/browser/unknown", { method: "POST" }), env);

  assert.equal(getResponse.status, 404);
  assert.deepEqual(await getResponse.json(), { code: "NOT_FOUND" });
  assert.equal(unknownResponse.status, 404);
  assert.deepEqual(await unknownResponse.json(), { code: "NOT_FOUND" });
});

test("Edge delegates lookalike non-browser namespaces to the existing Worker", async () => {
  const delegated = [];
  const delegate = {
    async fetch(request, env) {
      delegated.push({ url: request.url, env });
      return new Response("delegated", { status: 202 });
    },
  };
  const { createEdgeWorkerHandler } = await loadWorker("boundary");
  const handler = createEdgeWorkerHandler({ delegate });
  const env = { sentinel: true };
  const response = await handler.fetch(
    new Request("https://hub.example/hub/api/browserfoo"),
    env,
  );

  assert.equal(response.status, 202);
  assert.equal(await response.text(), "delegated");
  assert.deepEqual(delegated, [{ url: "https://hub.example/hub/api/browserfoo", env }]);
});
