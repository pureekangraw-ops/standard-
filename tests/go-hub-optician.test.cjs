"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "../go-hub-optician.js")).href;
const load = () => import(`${moduleUrl}?${Date.now()}-${Math.random()}`);

const canonicalContext = Object.freeze({
  purpose: "Build one bounded GO City piece",
  target: "pureekangraw-ops/standard-",
  action: "route to Factory",
  successCondition: "Return verified evidence to the same work checkpoint",
});

test("Optician fits relevant intake without forcing irrelevant 5W fields", async () => {
  const { fitWork } = await load();
  let executions = 0;
  const factory = { id: "factory", route: "destination://factory", run() { executions += 1; } };
  const fitted = fitWork({
    context: canonicalContext,
    lens: { id: "crystallize", reference: "lens://crystallize" },
    destination: factory,
  });

  assert.equal(fitted.gate, "PASS");
  assert.equal(fitted.lensReference, "lens://crystallize");
  assert.equal(fitted.route, "destination://factory");
  assert.equal(executions, 0);
  assert.equal("capability" in fitted, false);
});

test("Optician waits only for materially blocking canonical intake fields", async () => {
  const { fitWork } = await load();
  const noPurpose = fitWork({
    context: { ...canonicalContext, purpose: "" },
    lens: { id: "crystallize", reference: "lens://crystallize" },
    destination: { id: "factory", route: "destination://factory" },
  });
  const noSuccess = fitWork({
    context: { ...canonicalContext, successCondition: "" },
    lens: { id: "crystallize", reference: "lens://crystallize" },
    destination: { id: "factory", route: "destination://factory" },
  });

  assert.equal(noPurpose.gate, "WAIT");
  assert.deepEqual(noPurpose.missing, ["purpose"]);
  assert.equal(noSuccess.gate, "WAIT");
  assert.deepEqual(noSuccess.missing, ["successCondition"]);
});

test("Optician round gate reuses an unchanged fit and requests refit when Reality changes", async () => {
  const { fitWork, checkRound } = await load();
  const fitted = fitWork({
    context: canonicalContext,
    reality: { head: "abc", status: "working" },
    lens: { id: "crystallize", reference: "lens://crystallize" },
    destination: { id: "factory", route: "destination://factory" },
  });

  assert.equal(checkRound(fitted, {
    context: canonicalContext,
    reality: { head: "abc", status: "working" },
  }).decision, "REUSE_FIT");

  assert.equal(checkRound(fitted, {
    context: canonicalContext,
    reality: { head: "def", status: "working" },
  }).decision, "REFIT");
});

test("Optician consumes MIMIR information then rechecks the fitted view before continuing", async () => {
  const { fitFromInformation, checkRound } = await load();
  const reality = { head: "abc" };
  const fitted = fitFromInformation({
    context: canonicalContext,
    reality,
    lens: { id: "crystallize", reference: "lens://crystallize" },
    information: {
      status: "PASS",
      route: "destination://factory",
      records: [{ id: "factory", name: "Factory" }],
      evidence: { source: "notion", verifiedAt: "2026-09-15T12:00:00+07:00" },
    },
  });

  assert.equal(fitted.gate, "PASS");
  assert.equal(fitted.route, "destination://factory");
  assert.equal(fitted.informationSource, "mimir");
  assert.deepEqual(fitted.evidence, { source: "notion", verifiedAt: "2026-09-15T12:00:00+07:00" });
  assert.equal(checkRound(fitted, { context: canonicalContext, reality }).decision, "REUSE_FIT");
  assert.equal(checkRound(fitted, {
    context: canonicalContext,
    reality: { head: "def" },
  }).decision, "REFIT");
});

test("Optician waits when MIMIR has no usable information route", async () => {
  const { fitFromInformation } = await load();
  const fitted = fitFromInformation({
    context: canonicalContext,
    lens: { id: "crystallize", reference: "lens://crystallize" },
    information: { status: "WAIT", waitReason: "NO_MATCH", records: [], route: null },
  });

  assert.equal(fitted.gate, "WAIT");
  assert.equal(fitted.reason, "NO_MATCH");
  assert.equal(fitted.route, null);
});


test("Optician compatibility accepts current Role reference without requiring legacy Lens input", async () => {
  const { fitWork } = await load();
  const fitted = fitWork({
    context: canonicalContext,
    role: { id: "detective", reference: "role://detective" },
    destination: { id: "factory", route: "destination://factory" },
  });

  assert.equal(fitted.gate, "PASS");
  assert.equal(fitted.roleReference, "role://detective");
  assert.equal(fitted.lensReference, "role://detective");
});
