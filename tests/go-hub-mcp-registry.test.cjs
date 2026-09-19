"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const registryUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-mcp-registry.mjs")).href;
const factoryWorkContext = Object.freeze({
  workId: "WORK-A", checkpointId: "CENTRE-001", returnAddress: "CENTRE-001",
  destination: "destination://factory", task: "Build GO City",
  requestedResult: "Verified result", lensReference: "lens://city",
});
const mimirWorkContext = Object.freeze({ ...factoryWorkContext, destination: "destination://mimir" });
const linearWorkContext = Object.freeze({ ...factoryWorkContext, destination: "destination://linear" });
const driveWorkContext = Object.freeze({ ...factoryWorkContext, destination: "destination://drive" });
const counterWorkContext = Object.freeze({ ...factoryWorkContext, destination: "destination://counter" });

test("registry publishes lifecycle plus one Hephaestus Foreman tool with safe annotations", async () => {
  const { createMcpRegistry } = await import(registryUrl + "?contract=" + Date.now());
  const calls = [];
  const lifecycle = new Proxy({}, {
    get: (_, name) => async input => {
      calls.push({ name, input });
      return new Response(JSON.stringify({ ok: true, operation: name }), { headers: { "content-type": "application/json" } });
    },
  });
  const registry = createMcpRegistry({ lifecycle });
  const tools = registry.listTools();
  assert.deepEqual(tools.map(tool => tool.name), [
    "go_hub_inspect_repository", "go_hub_list_repositories", "go_hub_read_file",
    "go_hub_create_branch", "go_hub_put_file", "go_hub_delete_file", "go_hub_compare_refs",
    "go_hub_open_pull_request", "go_hub_get_pull_request", "go_hub_get_ci",
    "go_hub_get_failure_evidence", "go_hub_rerun_failed_jobs", "go_hub_factory_action", "go_hub_factory_foreman",
    "go_hub_maintenance", "go_hub_merge_pull_request", "go_hub_get_workflow_runs", "go_hub_list_workflow_artifacts", "go_hub_archive_workflow_artifact", "go_hub_audit_history", "go_hub_centre_live_action",
    "go_hub_lighthouse_control_port_state", "go_hub_lighthouse_control_port_command", "go_hub_project_status", "go_hub_board_pin_route",
    "go_hub_counter_create", "go_hub_counter_get", "go_hub_counter_seen", "go_hub_counter_answer", "go_hub_counter_readback", "go_hub_mimir_search_catalog",
    "go_hub_mimir_search_knowledge", "go_hub_observer_latest", "go_hub_observer_screenshot", "go_hub_linear_list_projects", "go_hub_linear_get_issue",
    "go_hub_linear_create_issue", "go_hub_linear_update_issue",
    "go_hub_drive_capabilities", "go_hub_drive_health", "go_hub_drive_diagnostics", "go_hub_drive_root", "go_hub_drive_get_item", "go_hub_drive_list_children",
    "go_hub_drive_create_folder", "go_hub_drive_move_item", "go_hub_drive_rename_item",
  ]);
  assert.equal(tools[0].annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === "go_hub_factory_foreman").annotations.readOnlyHint, false);
  assert.equal(tools.find(tool => tool.name === "go_hub_maintenance").annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === "go_hub_merge_pull_request").annotations.destructiveHint, true);
  assert.equal(tools.find(tool => tool.name === "go_hub_mimir_search_knowledge").annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === "go_hub_list_workflow_artifacts").annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === "go_hub_archive_workflow_artifact").annotations.readOnlyHint, false);
  assert.equal(tools.find(tool => tool.name === "go_hub_audit_history").annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === "go_hub_centre_live_action").annotations.readOnlyHint, false);
  assert.equal(tools.find(tool => tool.name === "go_hub_lighthouse_control_port_state").annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === "go_hub_lighthouse_control_port_command").annotations.readOnlyHint, false);
  assert.equal(tools.find(tool => tool.name === "go_hub_project_status").annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === "go_hub_board_pin_route").annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === "go_hub_counter_create").annotations.readOnlyHint, false);
  assert.equal(tools.find(tool => tool.name === "go_hub_counter_get").annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === "go_hub_counter_readback").annotations.readOnlyHint, false);
  assert.equal(tools.find(tool => tool.name === "go_hub_observer_latest").annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === "go_hub_observer_screenshot").annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === "go_hub_linear_list_projects").annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === "go_hub_linear_get_issue").annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === "go_hub_linear_create_issue").annotations.readOnlyHint, false);
  assert.equal(tools.find(tool => tool.name === "go_hub_linear_update_issue").annotations.readOnlyHint, false);
  assert.equal(tools.find(tool => tool.name === "go_hub_drive_capabilities").annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === "go_hub_drive_health").annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === "go_hub_drive_diagnostics").annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === "go_hub_drive_root").annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === "go_hub_drive_get_item").annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === "go_hub_drive_list_children").annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === "go_hub_drive_create_folder").annotations.readOnlyHint, false);
  assert.equal(tools.find(tool => tool.name === "go_hub_drive_move_item").annotations.readOnlyHint, false);
  assert.equal(tools.find(tool => tool.name === "go_hub_drive_rename_item").annotations.readOnlyHint, false);
  assert.deepEqual(tools[0].securitySchemes, [{ type: "oauth2", scopes: ["go-hub"] }]);

  for (const name of [
    "go_hub_create_branch", "go_hub_put_file", "go_hub_delete_file",
    "go_hub_open_pull_request", "go_hub_rerun_failed_jobs", "go_hub_factory_action",
    "go_hub_merge_pull_request", "go_hub_counter_create", "go_hub_counter_get", "go_hub_counter_seen", "go_hub_counter_answer", "go_hub_counter_readback",
    "go_hub_mimir_search_catalog", "go_hub_mimir_search_knowledge",
    "go_hub_linear_create_issue", "go_hub_linear_update_issue",
    "go_hub_drive_create_folder", "go_hub_drive_move_item", "go_hub_drive_rename_item",
  ]) {
    assert.equal(tools.find(tool => tool.name === name).inputSchema.required.includes("workContext"), true, `${name} must require city work context`);
  }
  const foremanSchema = tools.find(tool => tool.name === "go_hub_factory_foreman").inputSchema;
  assert.equal(Object.hasOwn(foremanSchema.properties, "workContext"), true);
  assert.equal(foremanSchema.required.includes("workContext"), false, "Foreman state inspection remains admin-readable");
  assert.equal(tools.find(tool => tool.name === "go_hub_inspect_repository").inputSchema.required.includes("workContext"), false);
  assert.equal(tools.find(tool => tool.name === "go_hub_linear_list_projects").inputSchema.required.includes("workContext"), false);
  assert.equal(tools.find(tool => tool.name === "go_hub_linear_get_issue").inputSchema.required.includes("workContext"), false);
  assert.equal(tools.find(tool => tool.name === "go_hub_observer_latest").inputSchema.required.includes("workContext"), false);
  assert.equal(tools.find(tool => tool.name === "go_hub_observer_screenshot").inputSchema.required.includes("workContext"), false);
  assert.equal(tools.find(tool => tool.name === "go_hub_project_status").inputSchema.required.includes("workContext"), false);
  assert.equal(tools.find(tool => tool.name === "go_hub_board_pin_route").inputSchema.required.includes("workContext"), false);
  assert.equal(tools.find(tool => tool.name === "go_hub_drive_root").inputSchema.required.includes("workContext"), false);

  await registry.callTool("go_hub_inspect_repository", { repository: "pureekangraw-ops/standard-", branch: "main" });
  await registry.callTool("go_hub_factory_foreman", { action: "state", repository: "pureekangraw-ops/standard-" });
  assert.equal(calls[0].name, "inspect");
  assert.equal(calls[1].name, "factoryForeman");

  await registry.callTool("go_hub_counter_create", {
    counterId: "COUNTER-0001", request: "Find GO Hub source", context: {}, workContext: counterWorkContext,
  });
  assert.equal(calls.at(-1).name, "counterCreate");
  await registry.callTool("go_hub_counter_get", { counterId: "COUNTER-0001", workContext: counterWorkContext });
  assert.equal(calls.at(-1).name, "counterGet");
  await registry.callTool("go_hub_audit_history", { workId: "WORK-LIVE", afterSequence: 0, limit: 50 });
  assert.equal(calls.at(-1).name, "auditHistory");
  await registry.callTool("go_hub_centre_live_action", { action: "inspect", workId: "WORK-LIVE" });
  assert.equal(calls.at(-1).name, "centreLiveAction");
  await registry.callTool("go_hub_lighthouse_control_port_state", { targetId: "lighthouse" });
  assert.equal(calls.at(-1).name, "lighthouseControlPortState");
  await registry.callTool("go_hub_lighthouse_control_port_command", { targetId: "lighthouse", requestId: "hub-1", capabilityId: "system.appState", payload: {} });
  assert.equal(calls.at(-1).name, "lighthouseControlPortCommand");
  await registry.callTool("go_hub_project_status", { targetId: "lighthouse", factoryTaskId: "pureekangraw-ops:task-1" });
  assert.equal(calls.at(-1).name, "projectStatus");
  await registry.callTool("go_hub_board_pin_route", { firstCommand: "ต่อ", pin: { pinId:"PIN-1", status:"DOING" } });
  assert.equal(calls.at(-1).name, "boardPinRoute");
  await registry.callTool("go_hub_observer_latest", {});
  await registry.callTool("go_hub_observer_screenshot", { screenshotRef: "shot:1" });
  assert.equal(calls.at(-2).name, "observerLatest");
  assert.equal(calls.at(-1).name, "observerScreenshot");
  await registry.callTool("go_hub_list_workflow_artifacts", { repository: "pureekangraw-ops/ygph-metropolis", runId: 123 });
  assert.equal(calls.at(-1).name, "listWorkflowArtifacts");
  await registry.callTool("go_hub_archive_workflow_artifact", { repository: "pureekangraw-ops/ygph-metropolis", runId: 123, artifactId: 456, parentId: "folder-a", entrySuffix: "app.apk", destinationName: "app.apk", workContext: driveWorkContext });
  assert.equal(calls.at(-1).name, "archiveWorkflowArtifact");
});

test("city lifecycle tools require exact Centre identity and correct destination", async () => {
  const { createMcpRegistry } = await import(registryUrl + "?identity=" + Date.now());
  const calls = [];
  const lifecycle = new Proxy({}, {
    get: (_, name) => async input => {
      calls.push({ name, input });
      return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
    },
  });
  const registry = createMcpRegistry({ lifecycle });

  await assert.rejects(registry.callTool("go_hub_put_file", {
    repository: "pureekangraw-ops/standard-", path: "x.js", branch: "task-branch", content: "x",
  }), /workContext/);
  await assert.rejects(registry.callTool("go_hub_put_file", {
    repository: "pureekangraw-ops/standard-", path: "x.js", branch: "task-branch", content: "x",
    workContext: { ...factoryWorkContext, returnAddress: "CENTRE-002" },
  }), /Return Address|returnAddress/);
  await assert.rejects(registry.callTool("go_hub_counter_get", {
    counterId: "COUNTER-0001", workContext: mimirWorkContext,
  }), /destination/i);
  await assert.rejects(registry.callTool("go_hub_mimir_search_catalog", {
    task: "Find Factory", requestedResult: "Route evidence", workContext: factoryWorkContext,
  }), /destination/i);
  await assert.rejects(registry.callTool("go_hub_mimir_search_knowledge", {
    task: "Find knowledge", requestedResult: "Evidence", workContext: factoryWorkContext,
  }), /destination/i);
  await assert.rejects(registry.callTool("go_hub_factory_foreman", {
    action: "request", repository: "pureekangraw-ops/standard-", slot: "assembly", goId: "go-a", jobId: "job-a",
  }), /workContext/);
  await assert.rejects(registry.callTool("go_hub_linear_create_issue", {
    title: "Wrong route", workContext: factoryWorkContext,
  }), /destination/i);

  await registry.callTool("go_hub_mimir_search_catalog", {
    task: "Find Factory", requestedResult: "Route evidence", lensReference: "lens://city", workContext: mimirWorkContext,
  });
  assert.equal(calls.at(-1).name, "searchCatalog");
  assert.deepEqual(calls.at(-1).input.workContext, mimirWorkContext);

  await registry.callTool("go_hub_mimir_search_knowledge", {
    task: "Find software quality knowledge", requestedResult: "Evidence", lensReference: "lens://knowledge", workContext: mimirWorkContext,
  });
  assert.equal(calls.at(-1).name, "searchKnowledge");
  assert.deepEqual(calls.at(-1).input.workContext, mimirWorkContext);

  await registry.callTool("go_hub_linear_create_issue", {
    title: "Bridge", workContext: linearWorkContext,
  });
  assert.equal(calls.at(-1).name, "linearCreateIssue");
  assert.deepEqual(calls.at(-1).input.workContext, linearWorkContext);
});

test("merge schema requires active GO/job identity before work context", async () => {
  const { createMcpRegistry } = await import(registryUrl + "?merge=" + Date.now());
  const registry = createMcpRegistry({ lifecycle: { mergePullRequest: async () => new Response("{}") } });
  await assert.rejects(registry.callTool("go_hub_merge_pull_request", {
    repository: "pureekangraw-ops/standard-", number: 50, expectedHeadSha: "head-sha",
  }), /missing required argument: goId/);
  await assert.rejects(registry.callTool("go_hub_merge_pull_request", {
    repository: "pureekangraw-ops/standard-", number: 50, expectedHeadSha: "head-sha", goId: "go-a",
  }), /missing required argument: jobId/);
});

test("registry preserves domain failures and rejects unknown tools", async () => {
  const { createMcpRegistry } = await import(registryUrl + "?errors=" + Date.now());
  const registry = createMcpRegistry({ lifecycle: {
    putFile: async () => new Response(JSON.stringify({ code: "DEFAULT_BRANCH_WRITE_BLOCKED" }), { status: 409, headers: { "content-type": "application/json" } }),
  } });
  const blocked = await registry.callTool("go_hub_put_file", {
    repository: "pureekangraw-ops/standard-", path: "x.js", branch: "main", content: "x", workContext: factoryWorkContext,
  });
  assert.equal(blocked.isError, true);
  assert.deepEqual(blocked.structuredContent, { code: "DEFAULT_BRANCH_WRITE_BLOCKED" });
  await assert.rejects(registry.callTool("unknown", {}), /unknown MCP tool/);
});
