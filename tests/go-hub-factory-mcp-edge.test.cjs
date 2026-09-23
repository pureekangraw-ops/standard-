"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const edgeUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-edge-worker.mjs")).href;

test("live edge routes MCP through Factory MCP gate instead of legacy delegate", async () => {
  const { createEdgeWorkerHandler } = await import(edgeUrl + "?factory-edge=" + Date.now());
  let factoryCalls = 0;
  let delegateCalls = 0;
  const factoryMcp = {
    async fetch() {
      factoryCalls += 1;
      return new Response("factory", { status: 202 });
    },
  };
  const delegate = {
    async fetch() {
      delegateCalls += 1;
      return new Response("delegate", { status: 200 });
    },
  };
  const handler = createEdgeWorkerHandler({ delegate, factoryMcp });
  const response = await handler.fetch(new Request("https://hub.example/mcp", { method: "POST" }), {});

  assert.equal(response.status, 202);
  assert.equal(await response.text(), "factory");
  assert.equal(factoryCalls, 1);
  assert.equal(delegateCalls, 0);
});

test("live edge routes Centre API into durable Centre binding", async () => {
  const { createEdgeWorkerHandler } = await import(edgeUrl + "?centre-edge=" + Date.now());
  let delegateCalls = 0;
  let received = null;
  const namespace = {
    getByName(name) {
      assert.equal(name, "WORK-EDGE");
      return {
        async fetch(request) {
          received = await request.json();
          return new Response(JSON.stringify({
            ok: true,
            phase: "ARRIVED",
            workId: received.workId,
          }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      };
    },
  };
  const delegate = {
    async fetch() {
      delegateCalls += 1;
      return new Response("delegate", { status: 200 });
    },
  };
  const handler = createEdgeWorkerHandler({
    delegate,
    factoryMcp: { async fetch() { return new Response("factory"); } },
  });
  const response = await handler.fetch(new Request("https://hub.example/hub/api/centre/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "inspect", workId: "WORK-EDGE" }),
  }), {
    GO_HUB_CENTRE_STATE: namespace,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    phase: "ARRIVED",
    workId: "WORK-EDGE",
  });
  assert.equal(received.action, "inspect");
  assert.equal(delegateCalls, 0);
});


test("Factory MCP accepts Notion origin on the full /mcp surface", async () => {
  const factoryUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-factory-mcp-worker.mjs")).href;
  const { createFactoryMcpWorker } = await import(factoryUrl + "?notion-origin=" + Date.now());
  const worker = createFactoryMcpWorker({ fetchImpl: async () => { throw new Error("no upstream expected"); } });
  const response = await worker.fetch(new Request("https://hub.example/mcp", {
    method: "POST",
    headers: {
      origin: "https://app.notion.com",
      "content-type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  }), {
    GITHUB_TOKEN: "github-token",
    GOHUB_MASTER_KEY: "master-secret",
    GOHUB_OWNER_PASSCODE: "owner-passcode",
  });

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "UNAUTHORIZED");
});
