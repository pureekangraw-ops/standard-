"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "../go-hub-city-route.js")).href;
const load = () => import(`${moduleUrl}?${Date.now()}-${Math.random()}`);

test("GO City exposes Bifrost transport, Optician entry, and Heimdall exit guardian", async () => {
  const { createCityRoute } = await load();
  const city = createCityRoute();

  assert.equal(city.bridge.id, "bifrost");
  assert.equal(city.bridge.role, "CHAT_HUB_TRANSPORT");
  assert.equal(city.entry.id, "optician");
  assert.deepEqual(city.entry.responsibilities, ["INTAKE", "LENS", "ROUTE"]);
  assert.equal(city.guardian.id, "heimdall");
  assert.deepEqual(city.guardian.responsibilities, ["BOUNDARY", "SAFETY", "PERMISSION", "STOP", "EVIDENCE_GATE"]);
  assert.equal(city.exit.id, "heimdall");
  assert.equal(city.loop.id, "go-work-loop");
  assert.equal(city.information.id, "counter");
  assert.equal(city.destinations.factory.role, "building-entry");
});

test("inbound passage crosses Heimdall boundary before Optician fit", async () => {
  const { routeInbound } = await load();

  assert.deepEqual(routeInbound({
    heimdall: { decision: "PASS" },
    fit: { gate: "WAIT" },
  }), {
    destination: "optician",
    reason: "FIT_NOT_READY",
  });

  assert.deepEqual(routeInbound({
    heimdall: { decision: "PASS" },
    fit: { gate: "PASS", route: "destination://factory", destinationId: "factory" },
  }), {
    destination: "go-work-loop",
    via: "optician",
    boundary: "heimdall",
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

test("Counter is the city-wide information exchange and resumes at Optician by default", async () => {
  const { routeInformation } = await load();
  assert.deepEqual(routeInformation({ question: "where is Factory?" }), {
    destination: "counter",
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

test("outbound boundary can consume Heimdall Evidence Gate without moving QC authority",async()=>{const {routeOutbound}=await load();assert.deepEqual(routeOutbound({heimdall:{decision:"PASS"},evidenceGate:{workId:"W",checkpointId:"C",checks:[]}}),{destination:"heimdall",reason:"EVIDENCE_CHECKS_REQUIRED",evidenceDecision:"WAIT"});assert.equal(routeOutbound({heimdall:{decision:"PASS"},evidenceGate:{workId:"W",checkpointId:"C",checks:[{id:"factory-qc",status:"PASS",evidenceRef:"ev://qc"}]}}).destination,"bifrost");});

test("inbound passage cannot bypass Heimdall",async()=>{const {routeInbound}=await load();assert.deepEqual(routeInbound({heimdall:{decision:"WAIT",reason:"PERMISSION_REVIEW"},fit:{gate:"PASS",route:"destination://factory",destinationId:"factory"}}),{destination:"heimdall",reason:"PERMISSION_REVIEW"});});
