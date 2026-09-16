"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const registryUrl = pathToFileURL(path.join(root, "go-hub-mcp-registry.mjs")).href;
const workerUrl = pathToFileURL(path.join(root, "go-hub-factory-mcp-worker.mjs")).href;
const oauthUrl = pathToFileURL(path.join(root, "go-hub-oauth.mjs")).href;
const endpoint = "https://hub.example/mcp";

const linearWorkContext = Object.freeze({
  workId: "PUR-5",
  checkpointId: "PUR-5-LINEAR-WRITE",
  returnAddress: "PUR-5-LINEAR-WRITE",
  destination: "destination://linear",
  task: "Update Linear execution state",
  requestedResult: "Verified execution-state write",
  lensReference: "GO Hub ↔ Linear Bridge V1",
});

function rpc(token, name, args = {}) {
  return new Request(endpoint, {
    method: "POST",
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
}

test("registry publishes exactly four governed Linear bridge tools", async () => {
  const { createMcpRegistry } = await import(registryUrl + "?linear-tools=" + Date.now());
  const lifecycle = new Proxy({}, {
    get: (_, name) => async input => new Response(JSON.stringify({ operation: name, input }), {
      headers: { "content-type": "application/json" },
    }),
  });
  const registry = createMcpRegistry({ lifecycle });
  const tools = registry.listTools();
  const linearTools = tools.filter(tool => tool.name.startsWith("go_hub_linear_"));
  assert.deepEqual(linearTools.map(tool => tool.name), [
    "go_hub_linear_list_projects",
    "go_hub_linear_get_issue",
    "go_hub_linear_create_issue",
    "go_hub_linear_update_issue",
  ]);
  assert.equal(linearTools[0].annotations.readOnlyHint, true);
  assert.equal(linearTools[1].annotations.readOnlyHint, true);
  assert.equal(linearTools[2].annotations.readOnlyHint, false);
  assert.equal(linearTools[3].annotations.readOnlyHint, false);
  assert.equal(linearTools[2].inputSchema.required.includes("workContext"), true);
  assert.equal(linearTools[3].inputSchema.required.includes("workContext"), true);

  const created = await registry.callTool("go_hub_linear_create_issue", {
    title: "Bridge follow-up",
    workContext: linearWorkContext,
  });
  assert.equal(created.structuredContent.operation, "linearCreateIssue");
  assert.equal(created.structuredContent.input.workContext.destination, "destination://linear");

  await assert.rejects(registry.callTool("go_hub_linear_update_issue", {
    identifier: "PUR-5",
    title: "Updated",
  }), /workContext/);
  await assert.rejects(registry.callTool("go_hub_linear_create_issue", {
    title: "Wrong route",
    workContext: { ...linearWorkContext, destination: "destination://factory" },
  }), /destination/i);
});

test("Factory MCP worker injects server-side Linear config and serves project listing", async () => {
  const { createFactoryMcpWorker } = await import(workerUrl + "?linear-worker=" + Date.now());
  const { createTestAccessToken } = await import(oauthUrl + "?linear-token=" + Date.now());
  const signingKey = "test-signing-key-with-enough-entropy";
  const token = await createTestAccessToken({ issuer: "https://hub.example", signingKey });
  let linearRequest;
  const fetchImpl = async (url, init) => {
    if (String(url) !== "https://api.linear.app/graphql") throw new Error("unexpected upstream");
    linearRequest = { url: String(url), init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({
      data: {
        team: {
          id: "team-a",
          projects: {
            nodes: [{ id: "project-a", name: "Alpha", url: "https://linear.app/p/alpha", status: { name: "In Progress" } }],
          },
        },
      },
    }), { headers: { "content-type": "application/json" } });
  };
  const worker = createFactoryMcpWorker({ fetchImpl });
  const response = await worker.fetch(rpc(token, "go_hub_linear_list_projects"), {
    GITHUB_TOKEN: "github-token",
    GOHUB_MASTER_KEY: signingKey,
    GOHUB_OWNER_PASSCODE: "owner-passcode",
    LINEAR_API_KEY: "linear-secret",
    LINEAR_TEAM_ID: "team-a",
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload.result.structuredContent, {
    projects: [{ id: "project-a", name: "Alpha", status: "In Progress", url: "https://linear.app/p/alpha" }],
  });
  assert.equal(linearRequest.init.headers.authorization, "linear-secret");
  assert.equal(linearRequest.body.variables.teamId, "team-a");
  assert.doesNotMatch(linearRequest.init.body, /linear-secret/);
});

test("Factory MCP Linear route fails closed when server config is missing", async () => {
  const { createFactoryMcpWorker } = await import(workerUrl + "?linear-missing=" + Date.now());
  const { createTestAccessToken } = await import(oauthUrl + "?linear-missing-token=" + Date.now());
  const signingKey = "test-signing-key-with-enough-entropy";
  const token = await createTestAccessToken({ issuer: "https://hub.example", signingKey });
  let upstreamCalls = 0;
  const worker = createFactoryMcpWorker({ fetchImpl: async () => {
    upstreamCalls += 1;
    throw new Error("must not call upstream");
  } });
  const response = await worker.fetch(rpc(token, "go_hub_linear_list_projects"), {
    GITHUB_TOKEN: "github-token",
    GOHUB_MASTER_KEY: signingKey,
    GOHUB_OWNER_PASSCODE: "owner-passcode",
  });
  const payload = await response.json();
  assert.equal(payload.result.isError, true);
  assert.deepEqual(payload.result.structuredContent, { code: "LINEAR_NOT_CONFIGURED" });
  assert.equal(upstreamCalls, 0);
});
