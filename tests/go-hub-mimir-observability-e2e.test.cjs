"use strict";

const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const libraryUrl = pathToFileURL(path.join(root, "go-hub-mimir-library.js")).href;
const sourceUrl = pathToFileURL(path.join(root, "go-hub-mimir-source.js")).href;
const runtimeUrl = pathToFileURL(path.join(root, "go-hub-runtime.js")).href;

test("V5 Library -> Verification -> Traffic -> Dashboard observation path preserves shared reality without travel authority", async () => {
  const [libraryModule, sourceModule, runtimeModule] = await Promise.all([
    import(libraryUrl + "?e2e-library=" + Date.now()),
    import(sourceUrl + "?e2e-source=" + Date.now()),
    import(runtimeUrl + "?e2e-runtime=" + Date.now()),
  ]);

  const source = sourceModule.createMimirSourceRecord({
    id: "notion:helmet-guidance",
    type: "DOCUMENT",
    provider: "NOTION",
    location: "notion://helmet-guidance",
    sourceId: "page-helmet-guidance",
    sourceUrl: "https://www.notion.so/helmet-guidance",
    directness: "DIRECT",
    permission: "ALLOWED",
    availability: "AVAILABLE",
    retrievedAt: "2026-09-17T10:50:00Z",
    freshUntil: "2026-09-17T12:00:00Z",
  });

  const library = libraryModule.createMimirLibraryCore({
    resolveDirectory: () => ({ status: "WAIT", waitReason: "NO_ROUTE", departmentId: null, route: null }),
    departments: {
      knowledge: async () => ({
        status: "PASS",
        records: [{ id: "helmet-guidance", claim: "Measure head circumference before choosing helmet size" }],
        evidence: { sourceId: source.provenance.sourceId, provider: source.provider },
        route: "knowledge://notion",
      }),
    },
  });

  const libraryResult = await library.query({
    intent: "UNRECOGNIZED",
    departmentId: "knowledge",
    currentWork: "Finish GO V5 observability",
    searchFor: "helmet size",
    related: false,
    task: "Find helmet sizing guidance",
    requestedResult: "Usable source",
  });
  assert.equal(libraryResult.status, "PASS");
  assert.equal(libraryResult.directoryWarning, "NO_ROUTE");
  assert.equal(libraryResult.relevance.status, "WARNING");

  const libraryMonitor = runtimeModule.createLibraryStationMonitor({ query: "helmet size", result: libraryResult });
  assert.equal(libraryMonitor.status, "MATCH");
  const libraryTraffic = runtimeModule.createLibraryTrafficSummary({
    monitor: libraryMonitor,
    lastUpdate: "2026-09-17T10:00:00Z",
  });

  const verify = libraryModule.createMimirVerificationDesk({ now: () => new Date("2026-09-17T11:00:00Z") });
  const report = verify({
    claim: "Measure head circumference before choosing helmet size",
    evidence: [{ relation: "SUPPORTS", source }],
  });
  assert.equal(report.status, "PASS");

  const verificationMonitor = runtimeModule.createVerificationStationMonitor({ report });
  assert.equal(verificationMonitor.status, "PASS");
  const verificationTraffic = runtimeModule.createVerificationTrafficSummary({
    monitor: verificationMonitor,
    lastUpdate: "2026-09-17T10:58:00Z",
  });

  const snapshot = runtimeModule.createTrafficSnapshot({
    stations: ["library", "verification", "factory"],
    summaries: [libraryTraffic, verificationTraffic],
    now: new Date("2026-09-17T11:00:00Z"),
    staleAfterMs: 15 * 60 * 1000,
  });
  assert.deepEqual(snapshot, [
    { station: "library", status: "STALE", active: null, queue: null, blocked: null, lastUpdate: "2026-09-17T10:00:00Z" },
    { station: "verification", status: "NORMAL", active: null, queue: null, blocked: null, lastUpdate: "2026-09-17T10:58:00Z" },
    { station: "factory", status: "UNKNOWN", active: null, queue: null, blocked: null, lastUpdate: null },
  ]);

  const dashboard = runtimeModule.createTrafficDashboard(snapshot);
  assert.deepEqual(dashboard.overview, { stations: 3, active: 0, queued: 0, blocked: 0, stale: 1, unknown: 1 });
  assert.deepEqual(runtimeModule.getTrafficDashboardStation(dashboard, "library"), snapshot[0]);

  for (const value of [libraryResult.relevance, report, dashboard]) {
    for (const key of ["gate", "permission", "allowedToProceed", "nextStation", "routeDecision", "mutation"]) {
      assert.equal(Object.hasOwn(value, key), false, `${key} must not appear in the V5 observability path`);
    }
  }
});
