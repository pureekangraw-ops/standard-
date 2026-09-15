"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const serviceUrl = pathToFileURL(path.join(root, "go-hub-factory-service.mjs")).href;
const workspaceUrl = pathToFileURL(path.join(root, "go-hub-github-workspace.js")).href;
const registryUrl = pathToFileURL(path.join(root, "go-hub-mcp-registry.mjs")).href;
const repository = "pureekangraw-ops/standard-";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

test("Factory action service binds one owner-scoped task to one Durable Object stub", async () => {
  const { createFactoryActionService } = await import(serviceUrl + "?factory-service=" + Date.now());
  const names = [];
  let stored = null;
  const binding = {
    getByName(name) {
      names.push(name);
      return {
        async load() { return stored; },
        async save(input) {
          stored = { revision: 1, task: structuredClone(input.task), receipts: [input.receipt], audit: [input.auditEvent] };
          return { revision: 1, task: structuredClone(input.task), receipt: structuredClone(input.receipt) };
        },
      };
    },
  };
  const lifecycle = {
    inspect: async () => jsonResponse({ repository, defaultBranch: "main", branch: "main", baseSha: "base-1", headSha: "base-1", tree: [] }),
  };
  const service = createFactoryActionService({ lifecycle, binding, now: () => "now", createId: () => "r-1" });
  const response = await service({
    taskId: "pureekangraw-ops:bridge-1",
    action: "inspect",
    input: { repository, intent: "bridge", branch: "main" },
    expectedRevision: 0,
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.revision, 1);
  assert.equal(payload.receipt.action, "inspect");
  assert.deepEqual(names, ["pureekangraw-ops:bridge-1"]);

  await assert.rejects(service({
    taskId: "other-owner:bridge-1",
    action: "inspect",
    input: { repository, intent: "bridge" },
    expectedRevision: 0,
  }), /invalid Factory task ID/);
});

test("MCP registry publishes strict high-level Factory action", async () => {
  const { createMcpRegistry } = await import(registryUrl + "?factory-tool=" + Date.now());
  const calls = [];
  const lifecycle = new Proxy({}, {
    get: (_, name) => async input => {
      calls.push({ name, input });
      return jsonResponse({ ok: true });
    },
  });
  const registry = createMcpRegistry({ lifecycle });
  const tool = registry.listTools().find(item => item.name === "go_hub_factory_action");
  assert.ok(tool);
  assert.equal(tool.annotations.readOnlyHint, false);
  assert.equal(tool.annotations.destructiveHint, false);
  assert.deepEqual(tool.inputSchema.properties.action.enum, [
    "inspect", "create_branch", "write", "delete", "compare", "open_pr", "check_ci", "diagnose_failure",
  ]);
  await registry.callTool("go_hub_factory_action", {
    taskId: "pureekangraw-ops:bridge-1",
    action: "inspect",
    input: { repository, intent: "bridge" },
    expectedRevision: 0,
  });
  assert.equal(calls.at(-1).name, "factoryAction");
});

test("browser workspace calls Factory action through same-origin gateway without Authorization", async () => {
  const { createGitHubWorkspace } = await import(workspaceUrl + "?factory-action=" + Date.now());
  const calls = [];
  const workspace = createGitHubWorkspace({
    gatewayBase: "/hub/api/github-workspace",
    repository,
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ status: "OK", revision: 1 });
    },
  });
  const result = await workspace.factoryAction({
    taskId: "pureekangraw-ops:bridge-1",
    action: "inspect",
    input: { repository, intent: "bridge" },
    expectedRevision: 0,
  });
  assert.equal(result.revision, 1);
  assert.equal(calls[0].url, "/hub/api/github-workspace/factory-action");
  assert.equal(calls[0].init.method, "POST");
  assert.equal("authorization" in Object.fromEntries(Object.entries(calls[0].init.headers || {}).map(([k,v]) => [k.toLowerCase(),v])), false);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    taskId: "pureekangraw-ops:bridge-1",
    action: "inspect",
    input: { repository, intent: "bridge" },
    expectedRevision: 0,
  });
});
