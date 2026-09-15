"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "../go-hub-city-route.js")).href;
const load = () => import(`${moduleUrl}?${Date.now()}-${Math.random()}`);

test("GO City exposes the approved road map without treating Factory as the city centre", async () => {
  const { createCityRoute } = await load();
  const city = createCityRoute();

  assert.equal(city.entry.id, "optician");
  assert.deepEqual(city.entry.responsibilities, ["5W", "LENS", "GATE"]);
  assert.equal(city.loop.id, "go-work-loop");
  assert.deepEqual(city.loop.cycle, ["GO", "ACTION", "REALITY", "PROGRESS"]);
  assert.equal(city.loop.roundGate, "optician");
  assert.equal(city.information.id, "mimir");
  assert.equal(city.exit.id, "heimdall");
  assert.equal(city.bridge.id, "bifrost");
  assert.equal(city.returnTo, "big-chat");
  assert.equal(city.destinations.factory.role, "building-entry");
});

test("Heimdall sends unfinished work back to the loop and only ready work across Bifrost", async () => {
  const { routeExit } = await load();

  assert.deepEqual(routeExit({ done: false, exitReady: false }), {
    destination: "go-work-loop",
    via: "heimdall",
    reason: "WORK_NOT_DONE",
  });
  assert.deepEqual(routeExit({ done: true, exitReady: false }), {
    destination: "go-work-loop",
    via: "heimdall",
    reason: "EXIT_NOT_READY",
  });
  assert.deepEqual(routeExit({ done: true, exitReady: true }), {
    destination: "big-chat",
    via: "bifrost",
    reason: "READY_TO_RETURN",
  });
});

test("MIMIR is city-wide information/navigation and does not become a work destination", async () => {
  const { routeInformation } = await load();
  assert.deepEqual(routeInformation({ question: "where is Factory?", resumeAt: "go-work-loop" }), {
    destination: "mimir",
    purpose: "INFORMATION",
    resumeAt: "go-work-loop",
    question: "where is Factory?",
  });
});

test("Optician entry joins the work loop while Factory stays a referenced building and exit remains Heimdall", async () => {
  const { createCityRoute, enterWorkLoop, routeExit } = await load();
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
  assert.equal(city.destinations.factory.role, "building-entry");
  assert.equal(routeExit({ done: true, exitReady: false }).via, "heimdall");
  assert.equal(routeExit({ done: true, exitReady: true }).via, "bifrost");
});
