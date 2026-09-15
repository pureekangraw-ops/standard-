"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "../go-hub-city-route.js")).href;
const load = () => import(`${moduleUrl}?${Date.now()}-${Math.random()}`);

test("GO City exposes Bifrost transport then Optician then Heimdall before the city", async () => {
  const { createCityRoute } = await load();
  const city = createCityRoute();

  assert.equal(city.bridge.id, "bifrost");
  assert.equal(city.bridge.role, "CHAT_HUB_TRANSPORT");
  assert.equal(city.entry.id, "optician");
  assert.deepEqual(city.entry.responsibilities, ["INTAKE", "LENS", "ROUTE"]);
  assert.equal(city.guardian.id, "heimdall");
  assert.deepEqual(city.guardian.responsibilities, ["SAFETY", "PERMISSION", "STOP"]);
  assert.equal(city.loop.id, "go-work-loop");
  assert.equal(city.information.id, "mimir");
  assert.equal(city.destinations.factory.role, "building-entry");
});

test("inbound passage requires Optician fit before Heimdall can admit work to the city", async () => {
  const { routeInbound } = await load();

  assert.deepEqual(routeInbound({
    fit: { gate: "WAIT" },
    heimdall: { decision: "PASS" },
  }), {
    destination: "optician",
    reason: "FIT_NOT_READY",
  });

  assert.deepEqual(routeInbound({
    fit: { gate: "PASS", route: "destination://factory", destinationId: "factory" },
    heimdall: { decision: "WAIT", reason: "NEED_AUTHORITY" },
  }), {
    destination: "heimdall",
    reason: "NEED_AUTHORITY",
  });

  assert.deepEqual(routeInbound({
    fit: { gate: "PASS", route: "destination://factory", destinationId: "factory" },
    heimdall: { decision: "BLOCK", reason: "SAFETY_STOP" },
  }), {
    destination: "heimdall",
    reason: "SAFETY_STOP",
  });

  assert.deepEqual(routeInbound({
    fit: { gate: "PASS", route: "destination://factory", destinationId: "factory" },
    heimdall: { decision: "PASS" },
  }), {
    destination: "go-work-loop",
    via: ["optician", "heimdall"],
    workRoute: "destination://factory",
    destinationId: "factory",
  });
});

test("outbound passage uses Heimdall before Bifrost and returns to Optician when refit is needed", async () => {
  const { routeOutbound } = await load();

  assert.deepEqual(routeOutbound({
    heimdall: { decision: "WAIT", reason: "SAFETY_REVIEW" },
  }), {
    destination: "heimdall",
    reason: "SAFETY_REVIEW",
  });

  assert.deepEqual(routeOutbound({
    heimdall: { decision: "PASS" },
    needsOptician: true,
  }), {
    destination: "optician",
    via: "heimdall",
    reason: "REFIT_OR_SUMMARY_REQUIRED",
  });

  assert.deepEqual(routeOutbound({
    heimdall: { decision: "PASS" },
    needsOptician: false,
  }), {
    destination: "bifrost",
    via: "heimdall",
    next: "big-chat",
    reason: "PASSAGE_ALLOWED",
  });
});

test("MIMIR is city-wide information and always resumes at Optician by default", async () => {
  const { routeInformation } = await load();
  assert.deepEqual(routeInformation({ question: "where is Factory?" }), {
    destination: "mimir",
    purpose: "INFORMATION",
    resumeAt: "optician",
    question: "where is Factory?",
  });
});

test("legacy enterWorkLoop remains compatible while canonical gateway is explicit", async () => {
  const { createCityRoute, enterWorkLoop } = await load();
  const city = createCityRoute();
  const fitted = {
    gate: "PASS",
    lensReference: "lens://crystallize",
    route: city.destinations.factory.route,
    destinationId: "factory",
  };

  assert.deepEqual(enterWorkLoop(fitted), {
    destination: "go-work-loop",
    via: "optician",
    workRoute: "destination://factory",
    destinationId: "factory",
  });
});
