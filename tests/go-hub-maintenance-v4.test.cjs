const test = require("node:test");
const assert = require("node:assert/strict");

async function mod() { return import("../go-hub-maintenance.js"); }
async function body(response) { return JSON.parse(await response.text()); }

const map = {
  source: "GO_MANUAL_BASELINE",
  routes: [{
    id: "factory-github",
    from: "factory",
    to: "github",
    checkpoints: [
      { id: "route", importantValue: "route mapping", expected: "destination://github", source: "route-contract", probeAction: "read-route", mode: "READ", ownerSource: "go-hub" },
      { id: "scope", importantValue: "required scope", expected: { contains: ["repo:write"] }, source: "oauth", probeAction: "read-scope", mode: "PREFLIGHT", ownerSource: "go-hub" },
      { id: "boundary", importantValue: "github boundary", expected: "reachable", source: "github", probeAction: "preflight", mode: "SAFE_TEST", ownerSource: "github" },
    ],
  }],
};

test("maintenance requires Work and active Maintenance Pass", async () => {
  const { createMaintenanceService } = await mod();
  const service = createMaintenanceService();
  assert.equal((await service.maintenance({ action: "inspect" })).status, 409);
  assert.equal((await service.maintenance({ workId: "W1", action: "inspect" })).status, 409);
  assert.equal((await service.maintenance({ workId: "W1", maintenancePass: "ACTIVE", action: "inspect" })).status, 200);
});

test("route probe stops at first bad important value and marks downstream not checked", async () => {
  const { createMaintenanceService } = await mod();
  const values = {
    route: "destination://github",
    scope: ["repo:read"],
    boundary: "reachable",
  };
  const service = createMaintenanceService({
    readValue: async point => ({ available: true, value: values[point.id], evidence: `evidence:${point.id}` }),
    now: () => "2026-09-24T00:00:00.000Z",
    traceId: () => "TRACE-1",
  });
  const response = await service.maintenance({
    workId: "WORK-MAINT-1",
    maintenancePass: "ACTIVE",
    action: "probe_route",
    routeId: "factory-github",
    maintenanceMap: map,
  });
  const result = await body(response);
  assert.equal(result.routes[0].checkpoints[0].status, "PASS");
  assert.equal(result.routes[0].checkpoints[1].status, "FAIL");
  assert.equal(result.routes[0].checkpoints[1].reason, "VALUE_RELATION_MISMATCH");
  assert.equal(result.routes[0].checkpoints[2].status, "NOT_CHECKED");
  assert.equal(result.routes[0].firstBreak, "scope");
  assert.equal(result.autoRepair, false);
});

test("full system check reports observed reality without auto repair", async () => {
  const { createMaintenanceService } = await mod();
  const service = createMaintenanceService({
    readValue: async point => ({
      available: true,
      value: point.id === "scope" ? ["repo:write"] : point.id === "route" ? "destination://github" : "reachable",
    }),
    traceId: () => "TRACE-2",
    now: () => "2026-09-24T00:01:00.000Z",
  });
  const result = await body(await service.maintenance({
    workId: "WORK-MAINT-1",
    maintenancePass: "ACTIVE",
    action: "run_system_check",
    maintenanceMap: map,
  }));
  assert.equal(result.status, "MAINTENANCE_CHECK_COMPLETE");
  assert.equal(result.routes[0].status, "PASS");
  assert.equal(result.next, "FULL_SYSTEM_CHECK_VERIFIED");
  assert.equal(result.autoRepair, false);
});

test("unsafe probe mode is blocked before reader runs", async () => {
  const { createMaintenanceService } = await mod();
  let reads = 0;
  const service = createMaintenanceService({ readValue: async () => { reads += 1; return { available: true, value: true }; } });
  const unsafe = {
    routes: [{ id: "send-mail", from: "gmail", to: "external", checkpoints: [
      { id: "send", importantValue: "send action", expected: true, source: "gmail", probeAction: "send", mode: "MUTATE" },
    ] }],
  };
  const result = await body(await service.maintenance({
    workId: "WORK-MAINT-1", maintenancePass: "ACTIVE", action: "run_system_check", maintenanceMap: unsafe,
  }));
  assert.equal(result.routes[0].checkpoints[0].status, "BLOCKED");
  assert.equal(reads, 0);
});
