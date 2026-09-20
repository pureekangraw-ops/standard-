"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const cityUrl = pathToFileURL(path.join(root, "go-hub-city-route.js")).href;
const registryUrl = pathToFileURL(path.join(root, "go-hub-mcp-registry.mjs")).href;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("Centre read-only fast lane passes only Read -> Tell and skips Work ceremony", async () => {
  const { createCityRoute, routeReadOnlyFastLane } = await import(cityUrl + "?fast-lane=" + Date.now());
  const city = createCityRoute();

  assert.equal(city.readOnlyFastLane.id, "read-only-fast-lane");
  assert.deepEqual(city.readOnlyFastLane.operations, ["SEARCH", "LIST", "READ", "INSPECT", "METADATA"]);

  assert.deepEqual(routeReadOnlyFastLane({
    purpose: "READ_TELL",
    operations: ["SEARCH", "READ"],
  }), {
    gate: "PASS",
    destination: "read-only-fast-lane",
    via: "optician",
    purpose: "READ_TELL",
    operations: ["SEARCH", "READ"],
    workRequired: false,
    plannerRequired: false,
    fastLane: true,
    returnTo: "big-chat",
    reason: "READ_TELL_ONLY",
  });
});

test("reading for a checklist or later work escalates even when the immediate operation is READ", async () => {
  const { routeReadOnlyFastLane } = await import(cityUrl + "?read-for-work=" + Date.now());
  assert.deepEqual(routeReadOnlyFastLane({
    purpose: "READ_FOR_WORK",
    operations: ["READ"],
  }), {
    gate: "ESCALATE",
    destination: "optician",
    reason: "READ_SERVES_WORK",
    workRequired: true,
    fastLane: false,
    next: "normal-work-intake",
  });
});

test("a mutation request cannot hide inside the read-only fast lane", async () => {
  const { routeReadOnlyFastLane } = await import(cityUrl + "?mutation-block=" + Date.now());
  assert.deepEqual(routeReadOnlyFastLane({
    purpose: "READ_TELL",
    operations: ["READ", "UPDATE"],
  }), {
    gate: "ESCALATE",
    destination: "optician",
    reason: "READ_ONLY_BOUNDARY_EXCEEDED",
    workRequired: true,
    fastLane: false,
    forbiddenOperations: ["UPDATE"],
    next: "normal-work-intake",
  });
});

test("MCP publishes the fast lane as a read-only tool with no Work context requirement", async () => {
  const { createMcpRegistry } = await import(registryUrl + "?fast-lane-tool=" + Date.now());
  const calls = [];
  const lifecycle = new Proxy({}, {
    get: (_, name) => async input => {
      calls.push({ name, input });
      return jsonResponse({ ok: true, gate: "PASS" });
    },
  });
  const registry = createMcpRegistry({ lifecycle });
  const tool = registry.listTools().find(item => item.name === "go_hub_centre_read_only_fast_lane");

  assert.ok(tool);
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(tool.annotations.destructiveHint, false);
  assert.equal(Object.hasOwn(tool.inputSchema.properties, "workContext"), false);
  assert.deepEqual(tool.inputSchema.required, ["purpose", "operations"]);

  const result = await registry.callTool("go_hub_centre_read_only_fast_lane", {
    purpose: "READ_TELL",
    operations: ["SEARCH", "READ"],
  });
  assert.equal(result.structuredContent.gate, "PASS");
  assert.equal(calls.at(-1).name, "centreReadOnlyFastLane");
});
