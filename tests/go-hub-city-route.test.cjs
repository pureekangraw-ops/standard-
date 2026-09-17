"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "../go-hub-city-route.js")).href;
const load = () => import(`${moduleUrl}?${Date.now()}-${Math.random()}`);

test("GO City exposes Bifrost transport, Optician entry, Heimdall exit, and every current destination", async () => {
  const { createCityRoute } = await load();
  const city = createCityRoute();

  assert.equal(city.bridge.id, "bifrost");
  assert.equal(city.bridge.role, "CHAT_HUB_TRANSPORT");
  assert.equal(city.entry.id, "optician");
  assert.deepEqual(city.entry.responsibilities, ["INTAKE", "LENS", "ROUTE"]);
  assert.equal(city.guardian.id, "heimdall");
  assert.deepEqual(city.guardian.responsibilities, ["SAFETY", "PERMISSION", "STOP"]);
  assert.equal(city.exit.id, "heimdall");
  assert.equal(city.loop.id, "go-work-loop");
  assert.equal(city.information.id, "mimir");

  assert.deepEqual(Object.keys(city.destinations).sort(), ["browser", "factory", "linear", "mimir"]);
  assert.deepEqual(city.destinations.factory, {
    id: "factory", role: "building-entry", route: "destination://factory",
  });
  assert.deepEqual(city.destinations.mimir, {
    id: "mimir", role: "information-entry", route: "destination://mimir",
  });
  assert.deepEqual(city.destinations.linear, {
    id: "linear", role: "work-tracking-entry", route: "destination://linear",
  });
  assert.deepEqual(city.destinations.browser, {
    id: "browser", role: "reality-entry", route: "destination://browser",
  });
});

test("inbound passage requires Optician fit and only admits a canonical destination pair", async () => {
  const { routeInbound } = await load();

  assert.deepEqual(routeInbound({ fit: { gate: "WAIT" } }), {
    destination: "optician",
    reason: "FIT_NOT_READY",
  });

  assert.deepEqual(routeInbound({
    fit: { gate: "PASS", route: "destination://factory", destinationId: "factory" },
  }), {
    destination: "go-work-loop",
    via: "optician",
    workRoute: "destination://factory",
    destinationId: "factory",
  });

  assert.deepEqual(routeInbound({
    fit: { gate: "PASS", route: "destination://mimir", destinationId: "mimir" },
  }), {
    destination: "go-work-loop",
    via: "optician",
    workRoute: "destination://mimir",
    destinationId: "mimir",
  });

  assert.deepEqual(routeInbound({
    fit: { gate: "PASS", route: "destination://mimir", destinationId: "linear" },
  }), {
    destination: "optician",
    reason: "DESTINATION_NOT_CANONICAL",
  });

  assert.deepEqual(routeInbound({
    fit: { gate: "PASS", route: "destination://unknown", destinationId: "unknown" },
  }), {
    destination: "optician",
    reason: "DESTINATION_NOT_CANONICAL",
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
