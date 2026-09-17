"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const sourceUrl = pathToFileURL(path.join(root, "go-hub-mimir-source.js")).href;

test("MIMIR source contract keeps provenance, freshness, permission, availability, and conflict metadata", async () => {
  const module = await import(sourceUrl + "?source-contract=" + Date.now());
  assert.equal(typeof module.createMimirSourceRecord, "function");

  const source = module.createMimirSourceRecord({
    id: "github:standard:main",
    type: "INTERNAL_REALITY",
    provider: "GITHUB",
    location: "github://pureekangraw-ops/standard-/main",
    sourceId: "4b9f3e5f",
    sourceUrl: "https://github.com/pureekangraw-ops/standard-/tree/main",
    directness: "DIRECT",
    permission: "ALLOWED",
    availability: "AVAILABLE",
    retrievedAt: "2026-09-17T03:00:00Z",
    freshUntil: "2026-09-17T03:15:00Z",
    conflictWith: ["runtime:deployed-main"],
  });

  assert.equal(source.type, "INTERNAL_REALITY");
  assert.equal(source.provenance.sourceId, "4b9f3e5f");
  assert.equal(source.provenance.directness, "DIRECT");
  assert.equal(source.permission, "ALLOWED");
  assert.equal(source.availability, "AVAILABLE");
  assert.equal(source.freshness.retrievedAt, "2026-09-17T03:00:00Z");
  assert.equal(source.freshness.freshUntil, "2026-09-17T03:15:00Z");
  assert.deepEqual(source.conflictWith, ["runtime:deployed-main"]);
});

test("MIMIR source contract rejects unsupported source types instead of inventing a category", async () => {
  const module = await import(sourceUrl + "?source-type=" + Date.now());
  assert.throws(() => module.createMimirSourceRecord({
    id: "mystery",
    type: "MYSTERY",
    provider: "UNKNOWN",
    location: "unknown://mystery",
    sourceId: "mystery",
    sourceUrl: "unknown://mystery",
    directness: "INDIRECT",
    permission: "ALLOWED",
    availability: "AVAILABLE",
    retrievedAt: "2026-09-17T03:00:00Z",
  }), /unsupported MIMIR source type/);
});
