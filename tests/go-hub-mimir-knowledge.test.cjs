"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "..", "go-hub-mimir-knowledge.js")).href;

function record(overrides = {}) {
  return {
    id: overrides.id || "k-current",
    Title: overrides.title || "Software quality model",
    Topic: overrides.topic || "software quality",
    Claim: overrides.claim || "Product quality must be evaluated against explicit quality characteristics.",
    Summary: overrides.summary || "Use explicit quality characteristics as acceptance evidence.",
    "Knowledge Status": overrides.status || "CURRENT",
    "Verification State": overrides.verification || "VERIFIED",
    "Source ID": overrides.sourceId || "ISO-25010",
    "Source URL": overrides.sourceUrl || "https://example.test/iso-25010",
    Evidence: overrides.evidence || "Primary standard reviewed",
    "Verified Date": overrides.verifiedAt || "2026-09-16",
    "Review By": overrides.reviewBy || "2026-12-31",
    Rating: overrides.rating || "3.0",
    Tags: overrides.tags || "quality acceptance standard",
  };
}

test("knowledge search passes only CURRENT verified fresh knowledge before rating", async () => {
  const { createMimirKnowledgeSearchPort } = await import(moduleUrl + "?pass=" + Date.now());
  const search = createMimirKnowledgeSearchPort({
    now: () => new Date("2026-09-17T00:00:00Z"),
    readKnowledge: async () => [
      record({ id: "candidate", title: "Software quality candidate", status: "CANDIDATE", rating: "5.0" }),
      record({ id: "current", rating: "1.0" }),
    ],
  });

  const result = await search({ task: "software quality", requestedResult: "quality acceptance evidence" });
  assert.equal(result.status, "PASS");
  assert.equal(result.records[0].id, "current");
  assert.equal(result.records[0].knowledgeStatus, "CURRENT");
  assert.equal(result.evidence.gateBeforeRating, true);
});

test("knowledge search fails closed for stale current knowledge", async () => {
  const { createMimirKnowledgeSearchPort } = await import(moduleUrl + "?stale=" + Date.now());
  const search = createMimirKnowledgeSearchPort({
    now: () => new Date("2026-09-17T00:00:00Z"),
    readKnowledge: async () => [record({ reviewBy: "2026-09-01" })],
  });

  const result = await search({ task: "software quality", requestedResult: "acceptance evidence" });
  assert.equal(result.status, "WAIT");
  assert.equal(result.waitReason, "STALE_VERIFICATION");
  assert.equal(result.records[0].knowledgeStatus, "CURRENT");
});

test("knowledge lifecycle states never silently become current", async () => {
  const { createMimirKnowledgeSearchPort } = await import(moduleUrl + "?states=" + Date.now());
  for (const [status, reason] of [
    ["CANDIDATE", "CANDIDATE_NOT_ACCEPTED"],
    ["SUPERSEDED", "SUPERSEDED"],
    ["DISPUTED", "DISPUTED"],
    ["PENDING", "PENDING_VERIFICATION"],
  ]) {
    const search = createMimirKnowledgeSearchPort({
      now: () => new Date("2026-09-17T00:00:00Z"),
      readKnowledge: async () => [record({ status })],
    });
    const result = await search({ task: "software quality", requestedResult: "acceptance evidence" });
    assert.equal(result.status, "WAIT", status);
    assert.equal(result.waitReason, reason, status);
  }
});

test("knowledge requires source, evidence and review lifecycle fields", async () => {
  const { createMimirKnowledgeSearchPort } = await import(moduleUrl + "?required=" + Date.now());
  const search = createMimirKnowledgeSearchPort({
    now: () => new Date("2026-09-17T00:00:00Z"),
    readKnowledge: async () => [record({ evidence: "" })],
  });
  const result = await search({ task: "software quality", requestedResult: "acceptance evidence" });
  assert.equal(result.status, "WAIT");
  assert.equal(result.waitReason, "MISSING_DECISION_CRITICAL_FIELD");
});
