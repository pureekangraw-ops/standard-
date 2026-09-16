"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const workerUrl = pathToFileURL(path.join(root, "go-hub-factory-mcp-worker.mjs")).href;
const oauthUrl = pathToFileURL(path.join(root, "go-hub-oauth.mjs")).href;
const endpoint = "https://hub.example/mcp";

function rpc(token, name, args = {}) {
  return new Request(endpoint, {
    method: "POST",
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
}

test("Factory MCP worker resolves LINEAR_TEAM_KEY before listing projects", async () => {
  const { createFactoryMcpWorker } = await import(workerUrl + "?team-key=" + Date.now());
  const { createTestAccessToken } = await import(oauthUrl + "?team-key-token=" + Date.now());
  const signingKey = "test-signing-key-with-enough-entropy";
  const token = await createTestAccessToken({ issuer: "https://hub.example", signingKey });
  const requests = [];
  const fetchImpl = async (url, init) => {
    if (String(url) !== "https://api.linear.app/graphql") throw new Error("unexpected upstream");
    const body = JSON.parse(init.body);
    requests.push(body);
    if (requests.length === 1) {
      return new Response(JSON.stringify({ data: { teams: { nodes: [{ id: "team-a", key: "PUR", name: "Puree" }] } } }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ data: { team: { id: "team-a", projects: { nodes: [] } } } }), {
      headers: { "content-type": "application/json" },
    });
  };

  const worker = createFactoryMcpWorker({ fetchImpl });
  const response = await worker.fetch(rpc(token, "go_hub_linear_list_projects"), {
    GITHUB_TOKEN: "github-token",
    GOHUB_MASTER_KEY: signingKey,
    GOHUB_OWNER_PASSCODE: "owner-passcode",
    LINEAR_API_KEY: "linear-secret",
    LINEAR_TEAM_KEY: "PUR",
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload.result.structuredContent, { projects: [] });
  assert.equal(requests.length, 2);
  assert.match(requests[0].query, /teams/);
  assert.equal(requests[1].variables.teamId, "team-a");
});
