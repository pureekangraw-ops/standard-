const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const pinRouteUrl = pathToFileURL(path.join(root, "go-hub-board-pin-route.js")).href;
const projectStatusUrl = pathToFileURL(path.join(root, "go-hub-project-status.js")).href;
const projectStatusServiceUrl = pathToFileURL(path.join(root, "go-hub-project-status-service.mjs")).href;

test("first command locks Pin identity policy: continue/edit reuse, archived reopens, create makes new", async () => {
  const { lockPinIntent, resolvePinRoute } = await import(pinRouteUrl);

  const continued = resolvePinRoute({
    intent: lockPinIntent("ต่องานเดิม"),
    pin: { pinId:"PIN-1", status:"DOING" },
  });
  assert.equal(continued.action, "USE_EXISTING");
  assert.equal(continued.pinId, "PIN-1");
  assert.equal(continued.nextStatus, null);

  const editedArchived = resolvePinRoute({
    intent: lockPinIntent("แก้ไขรายการนี้"),
    pin: { pinId:"PIN-2", status:"ARCHIVED" },
  });
  assert.equal(editedArchived.action, "REOPEN_EXISTING");
  assert.equal(editedArchived.pinId, "PIN-2");
  assert.equal(editedArchived.nextStatus, "REOPENED");

  const created = resolvePinRoute({
    intent: lockPinIntent("สร้างเรื่องใหม่"),
    pin: { pinId:"PIN-OLD", status:"DOING" },
  });
  assert.equal(created.action, "CREATE_NEW");
  assert.equal(created.pinId, null);
});

test("LIGHT dispatch routes to the existing Counter without creating a new Pin", async () => {
  const { lockPinIntent, resolvePinRoute } = await import(pinRouteUrl + "?agent-trigger=" + Date.now());
  const route = resolvePinRoute({
    intent: lockPinIntent("ปลุกไลท์ให้รับ Counter เดิม"),
    pin: { pinId:"PIN-LIGHT-1", status:"DOING" },
  });
  assert.equal(route.mode,"AGENT_TRIGGER");
  assert.equal(route.action,"USE_EXISTING_FOR_AGENT_TRIGGER");
  assert.equal(route.pinId,"PIN-LIGHT-1");
  assert.equal(route.createAllowed,false);
  assert.equal(route.route,"destination://counter");
  assert.equal(route.operation,"go_hub_agent_trigger");

  const missing = resolvePinRoute({ intent:lockPinIntent("ส่งให้ไลท์"), pin:null });
  assert.equal(missing.action,"LOOKUP_REQUIRED");
  assert.equal(missing.createAllowed,false);
});

test("continue/edit never silently creates a replacement Pin when existing identity is unresolved", async () => {
  const { lockPinIntent, resolvePinRoute } = await import(pinRouteUrl);

  const route = resolvePinRoute({
    intent: lockPinIntent("ต่อ"),
    pin: null,
  });
  assert.equal(route.action, "LOOKUP_REQUIRED");
  assert.equal(route.createAllowed, false);
});

test("unknown first command requires review and a locked intent cannot be changed mid-stream", async () => {
  const { lockPinIntent, assertSamePinIntent, resolvePinRoute } = await import(pinRouteUrl);

  const unknown = lockPinIntent("ช่วยดูอันนี้หน่อย");
  assert.equal(unknown.mode, "REVIEW");
  assert.equal(resolvePinRoute({ intent:unknown, pin:null }).action, "REVIEW_REQUIRED");

  const locked = lockPinIntent("แก้ไข");
  assert.throws(() => assertSamePinIntent(locked, "สร้างใหม่"), /PIN_ROUTE_INTENT_CONFLICT/);
  assert.equal(assertSamePinIntent(locked, "แก้ต่ออีกนิด").mode, "REUSE");
});

test("Hub Project Status keeps one common envelope shape while preserving raw GitHub and Factory truth", async () => {
  const { createHubProjectStatusProjection } = await import(projectStatusUrl);

  const projection = createHubProjectStatusProjection({
    projectId:"LIGHTHOUSE",
    githubTruth:{
      repository:"pureekangraw-ops/ygph-metropolis",
      branch:"main",
      headSha:"abc123",
      freshness:"LIVE",
    },
    factoryTruth:{
      revision:7,
      task:{
        id:"pureekangraw-ops:lighthouse-1",
        intent:"continue board work",
        repository:"pureekangraw-ops/ygph-metropolis",
        state:"DEPLOYED",
        nextAction:"verify",
        blocker:null,
        headSha:"abc123",
        audit:[{ at:"2026-09-19T06:00:00.000Z", event:"STATE_TRANSITION" }],
      },
    },
  });

  assert.equal(projection.status, "VERIFY");
  assert.deepEqual(projection.sources.map(item => item.source), ["github", "factory"]);
  assert.equal(projection.sources[0].status, "VERIFY");
  assert.equal(projection.sources[0].sourceStatus, "SOURCE_COMMIT");
  assert.equal(projection.sources[0].detail.sha, "abc123");
  assert.equal(projection.sources[1].sourceStatus, "DEPLOYED");
  assert.equal(projection.sources[1].detail.taskId, "pureekangraw-ops:lighthouse-1");
  assert.equal(projection.sources[1].detail.revision, 7);
});

test("Hub Project Status is IDLE with GitHub-only truth and BLOCKED when Factory reports a blocker", async () => {
  const { createHubProjectStatusProjection } = await import(projectStatusUrl);

  const idle = createHubProjectStatusProjection({
    projectId:"LIGHTHOUSE",
    githubTruth:{ repository:"pureekangraw-ops/ygph-metropolis", branch:"main", headSha:"abc123" },
  });
  assert.equal(idle.status, "IDLE");
  assert.deepEqual(idle.sources.map(item => item.source), ["github"]);

  const blocked = createHubProjectStatusProjection({
    projectId:"LIGHTHOUSE",
    githubTruth:{ repository:"pureekangraw-ops/ygph-metropolis", branch:"main", headSha:"abc123" },
    factoryTruth:{
      revision:2,
      task:{
        id:"pureekangraw-ops:lighthouse-2",
        repository:"pureekangraw-ops/ygph-metropolis",
        state:"EDITING",
        nextAction:"resolve-blocker",
        blocker:"DEVICE_REQUIRED",
        audit:[],
      },
    },
  });
  assert.equal(blocked.status, "BLOCKED");
  assert.equal(blocked.sources[1].detail.blocker, "DEVICE_REQUIRED");
});

test("Project Status read service reads existing GitHub and Factory truth without writing either source", async () => {
  const { createProjectStatusReadService } = await import(projectStatusServiceUrl);
  const calls = [];
  const lifecycle = {
    inspect: async input => {
      calls.push({ kind:"github", input });
      return new Response(JSON.stringify({
        repository:input.repository,
        defaultBranch:"main",
        branch:"main",
        baseSha:"abc123",
        headSha:"abc123",
        tree:[],
      }), { status:200, headers:{ "content-type":"application/json" } });
    },
  };
  const state = {
    revision:4,
    task:{
      id:"pureekangraw-ops:live-task",
      repository:"pureekangraw-ops/ygph-metropolis",
      state:"CI_GREEN",
      nextAction:"merge",
      blocker:null,
      audit:[],
    },
    receipts:[],
    audit:[],
  };
  const factoryBinding = {
    getByName(name) {
      calls.push({ kind:"factory", name });
      return {
        async fetch(request) {
          assert.equal(new URL(request.url).pathname, "/load");
          assert.equal(request.method, "GET");
          return new Response(JSON.stringify(state), { status:200, headers:{ "content-type":"application/json" } });
        },
      };
    },
  };

  const service = createProjectStatusReadService({ lifecycle, factoryBinding });
  const result = await service.read({
    targetId:"lighthouse",
    factoryTaskId:"pureekangraw-ops:live-task",
  });

  assert.equal(result.projectId, "LIGHTHOUSE");
  assert.equal(result.sources[0].detail.repo, "pureekangraw-ops/ygph-metropolis");
  assert.equal(result.sources[1].detail.taskId, "pureekangraw-ops:live-task");
  assert.deepEqual(calls.map(item => item.kind), ["github", "factory"]);
});

test("Project Status read service rejects cross-target Factory state instead of merging unrelated truth", async () => {
  const { createProjectStatusReadService } = await import(projectStatusServiceUrl);
  const lifecycle = {
    inspect: async input => new Response(JSON.stringify({
      repository:input.repository,
      defaultBranch:"main",
      branch:"main",
      baseSha:"abc123",
      headSha:"abc123",
      tree:[],
    }), { status:200 }),
  };
  const factoryBinding = {
    getByName() {
      return {
        async fetch() {
          return new Response(JSON.stringify({
            revision:1,
            task:{
              id:"pureekangraw-ops:wrong",
              repository:"pureekangraw-ops/standard-",
              state:"EDITING",
              audit:[],
            },
            receipts:[],
            audit:[],
          }), { status:200 });
        },
      };
    },
  };

  const service = createProjectStatusReadService({ lifecycle, factoryBinding });
  await assert.rejects(
    service.read({ targetId:"lighthouse", factoryTaskId:"pureekangraw-ops:wrong" }),
    /PROJECT_STATUS_FACTORY_TARGET_MISMATCH/,
  );
});


test("Work ID remains the durable identity and Room ID is not required by Centre or Factory work context", async () => {
  const registryUrl = pathToFileURL(path.join(root, "go-hub-mcp-registry.mjs")).href;
  const { createMcpRegistry } = await import(registryUrl + "?work-id=" + Date.now());
  const lifecycle = new Proxy({}, {
    get: () => async () => new Response(JSON.stringify({ ok:true }), { status:200 }),
  });
  const tools = createMcpRegistry({ lifecycle }).listTools();

  const centre = tools.find(tool => tool.name === "go_hub_centre_live_action");
  assert.deepEqual(centre.inputSchema.required, ["action", "workId"]);
  assert.equal(Object.hasOwn(centre.inputSchema.properties, "roomId"), false);

  const putFile = tools.find(tool => tool.name === "go_hub_put_file");
  const context = putFile.inputSchema.properties.workContext;
  assert.equal(context.required.includes("workId"), true);
  assert.equal(context.required.includes("checkpointId"), true);
  assert.equal(context.required.includes("returnAddress"), true);
  assert.equal(context.required.includes("roomId"), false);
  assert.equal(Object.hasOwn(context.properties, "roomId"), false);
});
