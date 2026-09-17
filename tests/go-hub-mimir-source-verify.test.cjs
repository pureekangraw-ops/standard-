"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const sourceUrl = pathToFileURL(path.join(root, "go-hub-mimir-source.js")).href;
const libraryUrl = pathToFileURL(path.join(root, "go-hub-mimir-library.js")).href;

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

function directSource(id, overrides = {}) {
  return {
    id,
    type: "INTERNAL_REALITY",
    provider: "TEST",
    location: `test://${id}`,
    provenance: {
      sourceId: id,
      sourceUrl: `https://evidence.example/${id}`,
      directness: "DIRECT",
    },
    permission: "ALLOWED",
    availability: "AVAILABLE",
    freshness: {
      retrievedAt: "2026-09-17T10:00:00Z",
      freshUntil: "2026-09-17T12:00:00Z",
    },
    conflictWith: [],
    ...overrides,
  };
}

test("V5 MIMIR Verification reports PASS without granting travel permission", async () => {
  const module = await import(libraryUrl + "?verify-pass=" + Date.now());
  assert.equal(typeof module.createMimirVerificationDesk, "function");

  const verify = module.createMimirVerificationDesk({ now: () => new Date("2026-09-17T11:00:00Z") });
  const result = verify({
    claim: "main SHA is abc123",
    evidence: [{ relation: "SUPPORTS", source: directSource("github-main") }],
  });

  assert.equal(result.status, "PASS");
  assert.equal(result.reason, "DIRECT_EVIDENCE_SUPPORTS");
  assert.equal(Object.hasOwn(result, "allowedToProceed"), false);
  assert.equal(Object.hasOwn(result, "gate"), false);
  assert.equal(Object.hasOwn(result, "nextStation"), false);
});

test("V5 MIMIR Verification reports FAIL when usable direct evidence contradicts the claim", async () => {
  const module = await import(libraryUrl + "?verify-fail=" + Date.now());
  const verify = module.createMimirVerificationDesk({ now: () => new Date("2026-09-17T11:00:00Z") });

  const result = verify({
    claim: "main SHA is abc123",
    evidence: [{ relation: "CONTRADICTS", source: directSource("github-main") }],
  });

  assert.equal(result.status, "FAIL");
  assert.equal(result.reason, "DIRECT_EVIDENCE_CONTRADICTS");
});

test("V5 MIMIR Verification reports UNKNOWN for stale evidence or unresolved conflict", async () => {
  const module = await import(libraryUrl + "?verify-unknown=" + Date.now());
  const verify = module.createMimirVerificationDesk({ now: () => new Date("2026-09-17T11:00:00Z") });

  const stale = verify({
    claim: "deployment is current",
    evidence: [{
      relation: "SUPPORTS",
      source: directSource("stale-runtime", {
        freshness: { retrievedAt: "2026-09-17T09:00:00Z", freshUntil: "2026-09-17T10:00:00Z" },
      }),
    }],
  });
  assert.equal(stale.status, "UNKNOWN");
  assert.equal(stale.reason, "NO_USABLE_EVIDENCE");

  const conflict = verify({
    claim: "deployment is current",
    evidence: [
      { relation: "SUPPORTS", source: directSource("runtime-a") },
      { relation: "CONTRADICTS", source: directSource("runtime-b") },
    ],
  });
  assert.equal(conflict.status, "UNKNOWN");
  assert.equal(conflict.reason, "CONFLICTING_EVIDENCE");
});

test("V5 Trust keeps dimensions separate and never emits one overall score", async () => {
  const module = await import(libraryUrl + "?trust=" + Date.now());
  assert.equal(typeof module.evaluateMimirTrust, "function");

  const trust = module.evaluateMimirTrust({
    sources: [
      directSource("source-a"),
      directSource("source-b", {
        type: "PRIMARY",
        provenance: {
          sourceId: "source-b",
          sourceUrl: "https://evidence.example/source-b",
          directness: "INDIRECT",
        },
      }),
    ],
    now: new Date("2026-09-17T11:00:00Z"),
  });

  assert.equal(trust.authority, "MIXED");
  assert.equal(trust.directness, "MIXED");
  assert.equal(trust.freshness, "CURRENT");
  assert.equal(trust.corroboration, "MULTI_SOURCE");
  assert.equal(trust.provenance, "COMPLETE");
  assert.equal(Object.hasOwn(trust, "score"), false);
  assert.equal(Object.hasOwn(trust, "rating"), false);
  assert.equal(Object.hasOwn(trust, "overall"), false);
});
