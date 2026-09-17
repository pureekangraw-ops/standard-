"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const workerUrl = pathToFileURL(path.join(root, "go-hub-edge-worker.mjs")).href;

function browserResponse() {
  return new Response(JSON.stringify({
    success: true,
    result: {
      markdown: "# Product",
      accessibilityTree: {
        role: "RootWebArea",
        name: "Product editor",
        children: [{ role: "textbox", name: "Product name" }],
      },
    },
  }), { headers: { "content-type": "application/json" } });
}

async function loadWorker(tag) {
  return import(`${workerUrl}?owner-auth=${tag}-${Date.now()}`);
}

function browserWorkContext() {
  return {
    workId: "WORK-BROWSER-AUTH",
    checkpointId: "CENTRE-BROWSER-AUTH",
    returnAddress: "CENTRE-BROWSER-AUTH",
    destination: "destination://browser",
    task: "Read protected browser reality",
    requestedResult: "Return authenticated page evidence",
    lensReference: "lens://browser-owner-auth",
  };
}

function request(passcode) {
  const headers = { "content-type": "application/json" };
  if (passcode !== undefined) headers["x-go-owner-passcode"] = passcode;
  return new Request("https://hub.example/hub/api/browser/read", {
    method: "POST",
    headers,
    body: JSON.stringify({
      url: "https://shop.example.com/product/new",
      workContext: browserWorkContext(),
    }),
  });
}

function protectedEnv(browser, ownerPasscode) {
  const env = {
    BROWSER: browser,
    BROWSER_POLICY: {
      allowedHostnames: ["shop.example.com"],
      requireOwnerPasscode: true,
    },
  };
  if (ownerPasscode !== undefined) env.GOHUB_OWNER_PASSCODE = ownerPasscode;
  return env;
}

test("protected Browser policy fails closed when owner secret is not configured", async () => {
  let called = false;
  const browser = { async quickAction() { called = true; return browserResponse(); } };
  const { createEdgeWorkerHandler } = await loadWorker("secret-missing");
  const response = await createEdgeWorkerHandler().fetch(
    request("owner-secret"),
    protectedEnv(browser),
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: "BROWSER_OWNER_AUTH_NOT_CONFIGURED" });
  assert.equal(called, false);
});

test("protected Browser policy rejects missing or wrong owner passcode before Browser Run", async () => {
  let calls = 0;
  const browser = { async quickAction() { calls += 1; return browserResponse(); } };
  const { createEdgeWorkerHandler } = await loadWorker("wrong-passcode");
  const handler = createEdgeWorkerHandler();
  const env = protectedEnv(browser, "owner-secret");

  const missing = await handler.fetch(request(), env);
  const wrong = await handler.fetch(request("wrong-secret"), env);

  assert.equal(missing.status, 403);
  assert.deepEqual(await missing.json(), { code: "BROWSER_OWNER_AUTH_FAILED" });
  assert.equal(wrong.status, 403);
  assert.deepEqual(await wrong.json(), { code: "BROWSER_OWNER_AUTH_FAILED" });
  assert.equal(calls, 0);
});

test("protected Browser policy permits the configured owner after authentication", async () => {
  let calls = 0;
  const browser = { async quickAction() { calls += 1; return browserResponse(); } };
  const { createEdgeWorkerHandler } = await loadWorker("correct-passcode");
  const response = await createEdgeWorkerHandler().fetch(
    request("owner-secret"),
    protectedEnv(browser, "owner-secret"),
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.hostname, "shop.example.com");
  assert.equal(payload.fields[0].semanticRole, "title");
  assert.equal(calls, 1);
});
