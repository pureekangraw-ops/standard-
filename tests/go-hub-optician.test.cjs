"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "../go-hub-optician.js")).href;
const load = () => import(`${moduleUrl}?${Date.now()}-${Math.random()}`);

const completeContext = Object.freeze({
  who: "BIG",
  what: "Build one bounded piece",
  where: "standard-",
  when: "now",
  why: "advance the approved GO City work",
});

test("Optician fits complete 5W context to a lens and route without executing destination work", async () => {
  const { fitWork } = await load();
  let executions = 0;
  const factory = { id: "factory", route: "destination://factory", run() { executions += 1; } };
  const fitted = fitWork({
    context: completeContext,
    lens: { id: "crystallize", reference: "lens://crystallize" },
    destination: factory,
  });

  assert.equal(fitted.gate, "PASS");
  assert.equal(fitted.lensReference, "lens://crystallize");
  assert.equal(fitted.route, "destination://factory");
  assert.equal(executions, 0);
  assert.equal("capability" in fitted, false);
});

test("Optician fails closed when required 5W context is incomplete", async () => {
  const { fitWork } = await load();
  const fitted = fitWork({
    context: { ...completeContext, why: "" },
    lens: { id: "crystallize", reference: "lens://crystallize" },
    destination: { id: "factory", route: "destination://factory" },
  });

  assert.equal(fitted.gate, "WAIT");
  assert.deepEqual(fitted.missing, ["why"]);
  assert.equal(fitted.route, null);
});

test("Optician round gate reuses an unchanged fit and requests refit when Reality changes", async () => {
  const { fitWork, checkRound } = await load();
  const fitted = fitWork({
    context: completeContext,
    reality: { head: "abc", status: "working" },
    lens: { id: "crystallize", reference: "lens://crystallize" },
    destination: { id: "factory", route: "destination://factory" },
  });

  assert.equal(checkRound(fitted, {
    context: completeContext,
    reality: { head: "abc", status: "working" },
  }).decision, "REUSE_FIT");

  assert.equal(checkRound(fitted, {
    context: completeContext,
    reality: { head: "def", status: "working" },
  }).decision, "REFIT");
});
