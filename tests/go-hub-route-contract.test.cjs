"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "../go-hub-route-contract.js")).href;
const load = () => import(`${moduleUrl}?${Date.now()}-${Math.random()}`);

function workContext(destination = "destination://mimir", overrides = {}) {
  return {
    workId: "WORK-ROUTE-1",
    checkpointId: "CENTRE-ROUTE-1",
    returnAddress: "CENTRE-ROUTE-1",
    destination,
    task: "Use the selected city destination",
    requestedResult: "Return verified reality",
    lensReference: "lens://route-test",
    ...overrides,
  };
}

test("route contract exports all four canonical destinations", async () => {
  const { CITY_DESTINATIONS, getCityDestination } = await load();
  assert.deepEqual(Object.keys(CITY_DESTINATIONS).sort(), ["browser", "factory", "linear", "mimir"]);
  assert.equal(getCityDestination("factory"), CITY_DESTINATIONS.factory);
  assert.equal(getCityDestination("destination://browser"), CITY_DESTINATIONS.browser);
  assert.equal(getCityDestination("destination://unknown"), null);
});

test("shared work-context gate preserves exact Centre identity and destination", async () => {
  const { assertCityWorkContext } = await load();
  assert.equal(typeof assertCityWorkContext, "function");

  const accepted = assertCityWorkContext(workContext(), "destination://mimir");
  assert.equal(accepted.workId, "WORK-ROUTE-1");
  assert.equal(accepted.checkpointId, "CENTRE-ROUTE-1");
  assert.equal(accepted.returnAddress, "CENTRE-ROUTE-1");
  assert.equal(accepted.destination, "destination://mimir");

  assert.throws(
    () => assertCityWorkContext(workContext("destination://linear"), "destination://mimir"),
    /destination/i,
  );
  assert.throws(
    () => assertCityWorkContext(workContext("destination://mimir", { returnAddress: "CENTRE-OTHER" }), "destination://mimir"),
    /Return Address/i,
  );
  assert.throws(
    () => assertCityWorkContext(workContext("destination://mimir", { surprise: true }), "destination://mimir"),
    /unknown workContext field/i,
  );
});
