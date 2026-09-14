"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const mcpUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-mcp.mjs")).href;
const endpoint = "https://hub.example/mcp";

function rpc(method, params, id = 1, token = "valid") {
  return new Request(endpoint, {
    method: "POST",
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) }),
  });
}

test("MCP authenticates before initialize and negotiates a released protocol", async () => {
  const { createMcpHandler } = await import(mcpUrl + "?init=" + Date.now());
  const registry = { listTools: () => [], callTool: async () => ({}) };
  const authenticate = async request => {
    if (request.headers.get("authorization") !== "Bearer valid") throw new Error("unauthorized");
    return { subject: "big", scope: "go-hub" };
  };
  const handler = createMcpHandler({ registry, authenticate, issuer: "https://hub.example" });

  const denied = await handler(rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "x", version: "1" } }, 1, "bad"));
  assert.equal(denied.status, 401);
  assert.match(denied.headers.get("www-authenticate"), /oauth-protected-resource/);

  const response = await handler(rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "chatgpt", version: "1" },
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    jsonrpc: "2.0",
    id: 1,
    result: {
      protocolVersion: "2025-11-25",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "go-hub-factory", version: "1.0.0" },
    },
  });
});

test("MCP lists and calls registry tools and accepts initialized notification", async () => {
  const { createMcpHandler } = await import(mcpUrl + "?tools=" + Date.now());
  const tool = { name: "go_hub_inspect_repository", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } };
  const registry = {
    listTools: () => [tool],
    callTool: async (name, args) => ({
      content: [{ type: "text", text: JSON.stringify({ name, args }) }],
      structuredContent: { name, args },
    }),
  };
  const handler = createMcpHandler({
    registry,
    authenticate: async () => ({ subject: "big", scope: "go-hub" }),
    issuer: "https://hub.example",
  });

  const list = await handler(rpc("tools/list", {}));
  assert.deepEqual((await list.json()).result, { tools: [tool] });

  const call = await handler(rpc("tools/call", {
    name: "go_hub_inspect_repository",
    arguments: { repository: "pureekangraw-ops/standard-" },
  }));
  assert.equal((await call.json()).result.structuredContent.name, "go_hub_inspect_repository");

  const notification = new Request(endpoint, {
    method: "POST",
    headers: { authorization: "Bearer valid", "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
  assert.equal((await handler(notification)).status, 202);
});

test("MCP returns deterministic JSON-RPC errors", async () => {
  const { createMcpHandler } = await import(mcpUrl + "?errors=" + Date.now());
  const handler = createMcpHandler({
    registry: { listTools: () => [], callTool: async () => { throw new Error("unknown MCP tool"); } },
    authenticate: async () => ({ subject: "big", scope: "go-hub" }),
    issuer: "https://hub.example",
  });
  const parse = await handler(new Request(endpoint, {
    method: "POST",
    headers: { authorization: "Bearer valid", "content-type": "application/json" },
    body: "{",
  }));
  assert.equal((await parse.json()).error.code, -32700);

  const unknown = await handler(rpc("unknown", {}));
  assert.equal((await unknown.json()).error.code, -32601);
});
