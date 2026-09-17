"use strict";

const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const libraryUrl = pathToFileURL(path.join(root, "go-hub-mimir-library.js")).href;

test("V5 Library relevance check warns on weak relevance but never emits travel permission", async () => {
  const module = await import(libraryUrl + "?v5-relevance=" + Date.now());
  assert.equal(typeof module.assessMimirLibraryRelevance, "function");
  const relevance = module.assessMimirLibraryRelevance({
    currentWork: "Finish Factory E2E",
    searchFor: "helmet size",
    related: false,
  });
  assert.deepEqual(relevance, {
    currentWork: "Finish Factory E2E",
    searchFor: "helmet size",
    related: false,
    status: "WARNING",
    warning: "WEAK_RELEVANCE",
  });
  for (const key of ["gate", "permission", "allowedToProceed", "routeDecision"]) {
    assert.equal(Object.hasOwn(relevance, key), false, `${key} must not exist on Library relevance advice`);
  }
});

test("V5 Library can use an explicit department when Directory cannot select a route", async () => {
  const module = await import(libraryUrl + "?v5-directory-advice=" + Date.now());
  const calls = [];
  const library = module.createMimirLibraryCore({
    resolveDirectory: () => ({ status: "WAIT", waitReason: "NO_ROUTE", departmentId: null, route: null }),
    departments: {
      knowledge: async input => {
        calls.push(input);
        return { status: "PASS", records: [{ id: "k1" }], route: "knowledge://source", evidence: { source: "notion" } };
      },
    },
  });

  const result = await library.query({
    intent: "UNRECOGNIZED",
    departmentId: "knowledge",
    currentWork: "Finish Factory E2E",
    searchFor: "helmet size",
    related: false,
    task: "Find helmet sizing guidance",
    requestedResult: "Usable source",
  });

  assert.equal(calls.length, 1, "Directory selector failure must not block an explicitly selected department");
  assert.equal(result.status, "PASS");
  assert.equal(result.departmentId, "knowledge");
  assert.equal(result.directoryRoute, null);
  assert.equal(result.directoryWarning, "NO_ROUTE");
  assert.equal(result.relevance.status, "WARNING");
  assert.deepEqual(result.records, [{ id: "k1" }]);
});

test("V5 Library does not use explicit-department fallback to bypass a real permission boundary", async () => {
  const module = await import(libraryUrl + "?v5-boundary=" + Date.now());
  let called = false;
  const library = module.createMimirLibraryCore({
    resolveDirectory: () => ({ status: "WAIT", waitReason: "NEED_AUTHORITY", departmentId: null, route: null }),
    departments: {
      knowledge: async () => {
        called = true;
        return { status: "PASS", records: [{ id: "should-not-run" }] };
      },
    },
  });

  const result = await library.query({ intent: "KNOWLEDGE", departmentId: "knowledge", task: "restricted source" });
  assert.equal(called, false);
  assert.equal(result.status, "WAIT");
  assert.equal(result.waitReason, "NEED_AUTHORITY");
});
