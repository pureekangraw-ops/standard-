"use strict";

const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const runtimeUrl = pathToFileURL(path.join(root, "go-hub-runtime.js")).href;

test("V5 Library Traffic adapter reports station condition without inventing active or queue counts", async () => {
  const module = await import(runtimeUrl + "?library-traffic=" + Date.now());
  assert.equal(typeof module.createLibraryTrafficSummary, "function");

  const match = module.createLibraryStationMonitor({
    query: "helmet size",
    result: { status: "PASS", records: [{ id: "r1" }], evidence: { source: "notion" } },
  });
  assert.deepEqual(module.createLibraryTrafficSummary({ monitor: match, lastUpdate: "2026-09-17T12:10:00Z" }), {
    station: "library",
    status: "NORMAL",
    active: null,
    queue: null,
    blocked: null,
    lastUpdate: "2026-09-17T12:10:00Z",
  });

  const conflict = module.createLibraryStationMonitor({
    query: "runtime truth",
    result: { status: "WAIT", waitReason: "CONFLICT", records: [] },
  });
  assert.equal(module.createLibraryTrafficSummary({ monitor: conflict, lastUpdate: "2026-09-17T12:11:00Z" }).status, "ERROR");
});

test("V5 Verification Traffic adapter maps truth-report state without inventing workload metrics", async () => {
  const module = await import(runtimeUrl + "?verification-traffic=" + Date.now());
  assert.equal(typeof module.createVerificationTrafficSummary, "function");

  const checking = module.createVerificationStationMonitor({ checking: true });
  assert.deepEqual(module.createVerificationTrafficSummary({ monitor: checking, lastUpdate: "2026-09-17T12:12:00Z" }), {
    station: "verification",
    status: "BUSY",
    active: null,
    queue: null,
    blocked: null,
    lastUpdate: "2026-09-17T12:12:00Z",
  });

  const failed = module.createVerificationStationMonitor({ report: { status: "FAIL", reason: "CONTRADICTED", evidence: [] } });
  assert.equal(module.createVerificationTrafficSummary({ monitor: failed, lastUpdate: "2026-09-17T12:13:00Z" }).status, "ERROR");
  const unknown = module.createVerificationStationMonitor({});
  assert.equal(module.createVerificationTrafficSummary({ monitor: unknown, lastUpdate: "2026-09-17T12:14:00Z" }).status, "UNKNOWN");
});
