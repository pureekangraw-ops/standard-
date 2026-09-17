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

test("Maintenance inspect exposes plan-only Factory capability", async () => {
  const { createMaintenanceService } = await import(maintenanceUrl);
  const service = createMaintenanceService();
  const response = service.maintenance({ target: "factory", action: "inspect", input: {} });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "MAINTENANCE_READY");
  assert.equal(body.authority, "PLAN_ONLY");
  assert.equal(body.mutates, false);
  assert.deepEqual(body.actions, ["inspect", "plan_closeout"]);
});

test("Maintenance delegates closeout planning to verified Housekeeper truth", async () => {
  const { createMaintenanceService } = await import(maintenanceUrl);
  const service = createMaintenanceService();
  const response = service.maintenance({
    target: "factory",
    action: "plan_closeout",
    input: {
      task: { id: "t1", factoryStage: "PRODUCT_VERIFIED", buildArtifact: { id: "apk", digest: "sha256:ok" } },
      scan: { status: "VERIFIED_CHAIN", artifactId: "apk", artifactDigest: "sha256:ok" },
      transientKeys: ["draft"],
      obsoleteKeys: ["old-cache"],
    },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "MAINTENANCE_PLAN_READY");
  assert.equal(body.plan.status, "CLOSEOUT_READY");
  assert.equal(body.mutates, false);
});

test("Maintenance refuses stale closeout evidence instead of mutating state", async () => {
  const { createMaintenanceService } = await import(maintenanceUrl);
  const service = createMaintenanceService();
  const response = service.maintenance({
    target: "factory",
    action: "plan_closeout",
    input: {
      task: { id: "t1", factoryStage: "PRODUCT_VERIFIED", buildArtifact: { id: "apk", digest: "sha256:new" } },
      scan: { status: "VERIFIED_CHAIN", artifactId: "apk", artifactDigest: "sha256:old" },
    },
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "MAINTENANCE_PLAN_REFUSED");
});

test("MCP Maintenance requires the Maintenance destination contract", async () => {
  const { createMcpRegistry } = await import(registryUrl);
  const lifecycle = {
    maintenance: input => new Response(JSON.stringify({ ok: true, input }), { headers: { "content-type": "application/json" } }),
  };
  const registry = createMcpRegistry({ lifecycle });
  assert.ok(registry.listTools().some(tool => tool.name === "go_hub_maintenance"));

  const good = await registry.callTool("go_hub_maintenance", {
    target: "factory",
    action: "inspect",
    input: {},
    workContext,
  });
  assert.equal(good.structuredContent.ok, true);

  await assert.rejects(() => registry.callTool("go_hub_maintenance", {
    target: "factory",
    action: "inspect",
    input: {},
    workContext: { ...workContext, destination: "destination://factory" },
  }), /destination:\/\/maintenance/);
});
