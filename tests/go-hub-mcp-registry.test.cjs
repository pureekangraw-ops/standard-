"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const registryUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-mcp-registry.mjs")).href;

test("registry publishes exact lifecycle tools with safe annotations", async () => {
  const { createMcpRegistry } = await import(registryUrl + "?contract=" + Date.now());
  const calls = [];
  const lifecycle = new Proxy({}, {
    get: (_, name) => async input => {
      calls.push({ name, input });
      return new Response(JSON.stringify({ ok: true, operation: name }), {
        headers: { "content-type": "application/json" },
      });
    },
  });
  const registry = createMcpRegistry({ lifecycle });
  const tools = registry.listTools();
  assert.deepEqual(tools.map(tool => tool.name), [
    "go_hub_inspect_repository",
    "go_hub_read_file",
    "go_hub_create_branch",
    "go_hub_put_file",
    "go_hub_delete_file",
    "go_hub_compare_refs",
    "go_hub_open_pull_request",
    "go_hub_get_pull_request",
    "go_hub_get_ci",
    "go_hub_rerun_failed_jobs",
    "go_hub_merge_pull_request",
    "go_hub_get_workflow_runs",
  ]);
  assert.equal(tools[0].annotations.readOnlyHint, true);
  assert.deepEqual(tools[0].securitySchemes, [{ type: "oauth2", scopes: ["go-hub"] }]);
  assert.ok(tools.every(tool => Array.isArray(tool.securitySchemes)));
  assert.equal(tools.find(tool => tool.name === "go_hub_put_file").annotations.readOnlyHint, false);
  assert.equal(tools.find(tool => tool.name === "go_hub_delete_file").annotations.destructiveHint, true);
  assert.equal(tools.find(tool => tool.name === "go_hub_merge_pull_request").annotations.destructiveHint, true);

  const result = await registry.callTool("go_hub_inspect_repository", {
    repository: "pureekangraw-ops/standard-",
    branch: "main",
  });
  assert.deepEqual(result.structuredContent, { ok: true, operation: "inspect" });
  assert.equal(calls[0].name, "inspect");
});

test("registry preserves domain failures and rejects unknown tools", async () => {
  const { createMcpRegistry } = await import(registryUrl + "?errors=" + Date.now());
  const lifecycle = {
    putFile: async () => new Response(JSON.stringify({ code: "DEFAULT_BRANCH_WRITE_BLOCKED" }), {
      status: 409,
      headers: { "content-type": "application/json" },
    }),
  };
  const registry = createMcpRegistry({ lifecycle });
  const blocked = await registry.callTool("go_hub_put_file", {
    repository: "pureekangraw-ops/standard-",
    path: "x.js",
    branch: "main",
    content: "x",
  });
  assert.equal(blocked.isError, true);
  assert.deepEqual(blocked.structuredContent, { code: "DEFAULT_BRANCH_WRITE_BLOCKED" });
  await assert.rejects(registry.callTool("unknown", {}), /unknown MCP tool/);
});
