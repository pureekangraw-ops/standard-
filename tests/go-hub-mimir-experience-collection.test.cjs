"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const libraryUrl = pathToFileURL(path.join(root, "go-hub-mimir-library.js")).href;

test("MIMIR Experience retrieves reusable lessons with provenance and no automatic knowledge promotion", async () => {
  const module = await import(libraryUrl + "?experience-contract=" + Date.now());
  assert.equal(typeof module.createMimirExperienceSearchPort, "function");

  const searchExperience = module.createMimirExperienceSearchPort({
    readExperience: async () => [{
      id: "lesson-1",
      context: "Cloudflare worker deployment",
      action: "verify exact main SHA",
      finding: "deployed source can differ from assumed source",
      resolution: "check deployment and live runtime together",
      reusableWhen: "runtime differs from repository state",
      sourceTaskId: "task-69",
      sourceArtifactDigest: "sha256:abc",
      recordedAt: "2026-09-16T18:00:00Z",
      status: "RECORDED",
    }],
  });

  const result = await searchExperience({
    task: "runtime differs from repository state",
    requestedResult: "Reusable deployment lesson",
  });

  assert.equal(result.status, "PASS");
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].collection, "EXPERIENCE");
  assert.equal(result.records[0].sourceTaskId, "task-69");
  assert.equal(result.records[0].sourceArtifactDigest, "sha256:abc");
  assert.equal(result.records[0].canAutoPromoteToKnowledge, false);
});

test("MIMIR Experience source failure fails closed as SOURCE_UNAVAILABLE", async () => {
  const module = await import(libraryUrl + "?experience-source-failure=" + Date.now());
  const searchExperience = module.createMimirExperienceSearchPort({
    readExperience: async () => { throw new Error("provider offline"); },
  });

  const result = await searchExperience({ task: "anything", requestedResult: "reusable lesson" });

  assert.equal(result.status, "WAIT");
  assert.equal(result.waitReason, "SOURCE_UNAVAILABLE");
  assert.deepEqual(result.records, []);
});
