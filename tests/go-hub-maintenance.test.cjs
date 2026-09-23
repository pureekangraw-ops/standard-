"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const maintenanceUrl = pathToFileURL(path.join(root, "go-hub-maintenance.js")).href;

test("Maintenance classifies health and routes Factory-owned planning without claiming PLAN authority", async () => {
  const { createMaintenanceService } = await import(maintenanceUrl);
  const service = createMaintenanceService();
  const response = service.maintenance({ target: "factory", action: "inspect", input: {} });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.authority, "HEALTH_CLASSIFICATION_ROUTE_ONLY");
  assert.equal(body.mutates, false);
  assert.deepEqual(body.actions, ["inspect", "plan_closeout"]);
  assert.equal(body.nextRoute, "destination://factory");
});

test("Maintenance compatibility closeout delegates to Factory planning authority", async () => {
  const { createMaintenanceService } = await import(maintenanceUrl);
  const response = createMaintenanceService().maintenance({
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
  assert.equal(body.authority, "HEALTH_CLASSIFICATION_ROUTE_ONLY");
  assert.equal(body.delegatedAuthority, "factory");
  assert.equal(body.nextRoute, "destination://factory");
  assert.equal(body.plan.status, "CLOSEOUT_READY");
  assert.equal(body.mutates, false);
});

test("Maintenance refuses stale closeout evidence", async () => {
  const { createMaintenanceService } = await import(maintenanceUrl);
  const response = createMaintenanceService().maintenance({
    target: "factory", action: "plan_closeout",
    input: {
      task: { id: "t1", factoryStage: "PRODUCT_VERIFIED", buildArtifact: { id: "apk", digest: "sha256:new" } },
      scan: { status: "VERIFIED_CHAIN", artifactId: "apk", artifactDigest: "sha256:old" },
    },
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "MAINTENANCE_PLAN_REFUSED");
});
