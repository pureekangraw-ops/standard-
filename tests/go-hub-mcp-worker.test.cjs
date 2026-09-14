"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const workerUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-worker.mjs")).href;
const env = {
  GITHUB_TOKEN: "github-token",
  GOHUB_MASTER_KEY: "test-signing-key-with-enough-entropy",
  GOHUB_OWNER_PASSCODE: "owner-passcode",
};

test("Worker owns OAuth discovery and protected MCP routes before assets", async () => {
  const { createWorkerHandler } = await import(workerUrl + "?mcp-wire=" + Date.now());
  const assets = { fetch: async () => new Response("asset fallback") };
  const handler = createWorkerHandler({ fetchImpl: async () => { throw new Error("no upstream expected"); } });

  const metadata = await handler.fetch(
    new Request("https://hub.example/.well-known/oauth-protected-resource"),
    { ...env, ASSETS: assets },
  );
  assert.equal(metadata.status, 200);
  assert.deepEqual(await metadata.json(), {
    resource: "https://hub.example/mcp",
    authorization_servers: ["https://hub.example"],
    scopes_supported: ["go-hub"],
    bearer_methods_supported: ["header"],
  });

  const denied = await handler.fetch(
    new Request("https://hub.example/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    }),
    { ...env, ASSETS: assets },
  );
  assert.equal(denied.status, 401);
  assert.match(denied.headers.get("www-authenticate"), /oauth-protected-resource/);
});
