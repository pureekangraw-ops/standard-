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

test("MIMIR Experience never selects an OUTDATED lesson over a usable RECORDED lesson", async () => {
  const module = await import(libraryUrl + "?experience-outdated=" + Date.now());
  const searchExperience = module.createMimirExperienceSearchPort({
    readExperience: async () => [
      {
        id: "lesson-outdated",
        context: "runtime differs from repository state",
        action: "old action",
        finding: "old finding",
        resolution: "old resolution",
        reusableWhen: "runtime differs from repository state",
        sourceTaskId: "task-old",
        sourceArtifactDigest: "sha256:old",
        recordedAt: "2026-09-10T00:00:00Z",
        status: "OUTDATED",
      },
      {
        id: "lesson-current",
        context: "runtime repository",
        action: "verify current source",
        finding: "runtime differs",
        resolution: "compare repository state",
        reusableWhen: "state differs",
        sourceTaskId: "task-current",
        sourceArtifactDigest: "sha256:current",
        recordedAt: "2026-09-17T00:00:00Z",
        status: "RECORDED",
      },
    ],
  });

  const result = await searchExperience({ task: "runtime differs from repository state" });

  assert.equal(result.status, "PASS");
  assert.equal(result.records[0].id, "lesson-current");
});

test("MIMIR Experience surfaces DISPUTED lessons as conflict evidence instead of choosing one", async () => {
  const module = await import(libraryUrl + "?experience-disputed=" + Date.now());
  const searchExperience = module.createMimirExperienceSearchPort({
    readExperience: async () => [{
      id: "lesson-disputed",
      context: "runtime binding mismatch",
      action: "inspect binding",
      finding: "two explanations remain possible",
      resolution: "do not choose without evidence",
      reusableWhen: "runtime binding mismatch",
      sourceTaskId: "task-conflict",
      sourceArtifactDigest: "sha256:conflict",
      recordedAt: "2026-09-17T01:00:00Z",
      status: "DISPUTED",
    }],
  });

  const result = await searchExperience({ task: "runtime binding mismatch" });

  assert.equal(result.status, "WAIT");
  assert.equal(result.waitReason, "CONFLICT");
  assert.deepEqual(result.records, []);
  assert.deepEqual(result.evidence.conflictIds, ["lesson-disputed"]);
});

test("MIMIR Experience reports OUTDATED_LESSON when only outdated matches remain", async () => {
  const module = await import(libraryUrl + "?experience-outdated-only=" + Date.now());
  const searchExperience = module.createMimirExperienceSearchPort({
    readExperience: async () => [{
      id: "lesson-outdated-only",
      context: "legacy deployment route",
      action: "use legacy route",
      finding: "worked before cutover",
      resolution: "legacy resolution",
      reusableWhen: "legacy deployment route",
      sourceTaskId: "task-legacy",
      sourceArtifactDigest: "sha256:legacy",
      recordedAt: "2026-09-10T00:00:00Z",
      status: "OUTDATED",
    }],
  });

  const result = await searchExperience({ task: "legacy deployment route" });

  assert.equal(result.status, "WAIT");
  assert.equal(result.waitReason, "OUTDATED_LESSON");
  assert.deepEqual(result.evidence.outdatedIds, ["lesson-outdated-only"]);
});

test("Experience to Knowledge promotion is an explicit proposal and never an automatic write", async () => {
  const module = await import(libraryUrl + "?experience-promotion=" + Date.now());
  assert.equal(typeof module.proposeKnowledgeCandidateFromExperience, "function");
  const lesson = {
    id: "lesson-promote",
    context: "deployment verification",
    action: "compare exact SHA",
    finding: "runtime proof must match deployed source",
    resolution: "verify runtime after deploy",
    reusableWhen: "publishing runtime changes",
    sourceTaskId: "task-promote",
    sourceArtifactDigest: "sha256:promote",
    recordedAt: "2026-09-17T02:00:00Z",
    status: "RECORDED",
    collection: "EXPERIENCE",
  };

  const denied = module.proposeKnowledgeCandidateFromExperience(lesson, { authorized: false });
  assert.equal(denied.status, "WAIT");
  assert.equal(denied.waitReason, "NEED_AUTHORITY");

  const proposed = module.proposeKnowledgeCandidateFromExperience(lesson, { authorized: true });
  assert.equal(proposed.status, "PASS");
  assert.equal(proposed.writePerformed, false);
  assert.equal(proposed.candidate.knowledgeStatus, "CANDIDATE");
  assert.equal(proposed.candidate.verificationState, "PENDING");
  assert.equal(proposed.candidate.sourceId, "task-promote");
  assert.equal(proposed.candidate.evidence, "sha256:promote");
});
