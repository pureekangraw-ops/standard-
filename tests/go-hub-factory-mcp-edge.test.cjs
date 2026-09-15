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
