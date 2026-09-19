"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = pathToFileURL(path.join(root, "go-hub-project-status.js")).href;

test("Project Status Envelope V1 keeps one common shape and one optional personality detail object", async () => {
  const { createProjectStatusEnvelope } = await import(moduleUrl);
  const github = createProjectStatusEnvelope({
    projectId:"LIGHTHOUSE",
    source:"github",
    status:"ACTIVE",
    sourceStatus:"success",
    title:"GitHub",
    freshness:"LIVE",
    detail:{ repo:"pureekangraw-ops/ygph-metropolis", sha:"abc123" },
  });
  assert.equal(github.projectId, "LIGHTHOUSE");
  assert.equal(github.source, "github");
  assert.equal(github.status, "ACTIVE");
  assert.deepEqual(github.detail, { repo:"pureekangraw-ops/ygph-metropolis", sha:"abc123" });

  const empty = createProjectStatusEnvelope({
    projectId:"LIGHTHOUSE",
    source:"drive",
    status:"IDLE",
    freshness:"UNKNOWN",
    detail:null,
  });
  assert.equal(empty.detail, null);
});

test("GO Hub projection uses existing Code/Factory truth and omits unavailable source cards", async () => {
  const { createGoHubProjectStatus } = await import(moduleUrl);
  const project = createGoHubProjectStatus({
    projectId:"LIGHTHOUSE",
    now:Date.parse("2026-09-19T06:00:00.000Z"),
    taskSnapshot:{
      id:"code:WORK-1",
      intent:"ship LIGHTHOUSE",
      repository:"pureekangraw-ops/ygph-metropolis",
      state:"CI_RUNNING",
      baseBranch:"main",
      workBranch:"feat/project",
      headSha:"head123",
      pullRequest:{ number:161, state:"open" },
      ci:{ status:"in_progress", headSha:"head123" },
      factoryStage:"ASSEMBLY",
      assembly:{ id:"ASSEMBLY-1" },
      assemblyQc:null,
      blocker:null,
      nextAction:"check-ci",
      audit:[{ at:"2026-09-19T05:58:00.000Z", event:"STATE_TRANSITION" }],
    },
  });

  assert.equal(project.status, "ACTIVE");
  assert.deepEqual(project.sources.map(item => item.source), ["github","factory"]);
  assert.equal(project.sources.find(item => item.source === "github").freshness, "LIVE");
  assert.equal(project.sources.find(item => item.source === "github").detail.pr, 161);
  assert.equal(project.sources.find(item => item.source === "factory").detail.assembly, "ASSEMBLY-1");
  assert.equal(project.sources.some(item => item.source === "board"), false);
  assert.equal(project.sources.some(item => item.source === "lighthouse"), false);
  assert.equal(project.sources.some(item => item.source === "drive"), false);
});

test("GO Hub Project Status UI is read-only projection with manual refresh and no project truth store", () => {
  const shell = fs.readFileSync(path.join(root, "go-hub-shell.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "go-hub.html"), "utf8");
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const model = fs.readFileSync(path.join(root, "go-hub-project-status.js"), "utf8");

  assert.match(shell, /createGoHubProjectStatus/);
  assert.match(shell, /renderProjectStatus/);
  assert.match(shell, /data-project-status-refresh/);
  assert.match(shell, /location\?\.reload\?\.\(\)/);
  for (const page of [html, index]) {
    assert.match(page, /data-project-status/);
    assert.match(page, /data-project-status-sources/);
    assert.match(page, /One view · many systems/);
  }
  assert.doesNotMatch(shell, /projectStatusStore|PROJECT_STATUS_STORAGE|localStorage\.setItem\([^)]*project/i);
  assert.doesNotMatch(model, /localStorage|indexedDB/i);
});
