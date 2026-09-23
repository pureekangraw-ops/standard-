"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const maintenanceUrl = pathToFileURL(path.join(root, "go-hub-maintenance.js")).href;
const registryUrl = pathToFileURL(path.join(root, "go-hub-mcp-registry.mjs")).href;

const workContext = {
  workId: "w-maint",
  checkpointId: "cp-maint",
  returnAddress: "cp-maint",
  destination: "destination://maintenance",
  task: "inspect Factory maintenance",
  requestedResult: "governed maintenance evidence",
  lensReference: "maintenance-v1",
};

test("Maintenance inspect exposes classification/repair-route capability without Factory planning authority", async () => {
  const { createMaintenanceService } = await import(maintenanceUrl);
  const service = createMaintenanceService();
  const response = service.maintenance({ target: "factory", action: "inspect", input: {} });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "MAINTENANCE_READY");
  assert.equal(body.authority, "HEALTH_CLASSIFICATION_ROUTE_ONLY");
  assert.equal(body.mutates, false);
  assert.deepEqual(body.actions, ["inspect"]);
  assert.equal(body.nextRoute, "destination://factory");
});

test("Maintenance refuses Factory planning actions and routes planning back to Factory", async () => {
  const { createMaintenanceService } = await import(maintenanceUrl);
  const response = createMaintenanceService().maintenance({ target: "factory", action: "plan_closeout", input: {} });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "MAINTENANCE_ACTION_UNAVAILABLE");
});

test("MCP Maintenance requires the Maintenance destination contract and exposes inspect only", async () => {
  const { createMcpRegistry } = await import(registryUrl);
  const lifecycle = {
    maintenance: async input => new Response(JSON.stringify({ ok: true, input }), { status: 200, headers: { "content-type": "application/json" } }),
  };
  const registry = createMcpRegistry({ lifecycle });
  const tool = registry.listTools().find(item => item.name === "go_hub_maintenance");
  assert.ok(tool);
  assert.deepEqual(tool.inputSchema.properties.action.enum, ["inspect"]);

  await assert.rejects(() => registry.callTool("go_hub_maintenance", {
    target: "factory", action: "plan_closeout", input: {}, workContext,
  }), /invalid action/);

  await assert.rejects(() => registry.callTool("go_hub_maintenance", {
    target: "factory", action: "inspect", input: {},
    workContext: { ...workContext, destination: "destination://factory" },
  }), /destination:\/\/maintenance/);
});
