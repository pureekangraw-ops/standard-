"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = pathToFileURL(path.join(root, "go-hub-workbench-model.js")).href;

async function load() {
  return import(`${moduleUrl}?workbench=${Date.now()}-${Math.random()}`);
}

test("projects the six mounted workbench truths from one task snapshot", async () => {
  const { createWorkbenchView } = await load();
  const view = createWorkbenchView({
    mission: { summary: "Build Engine 1", outcome: "Resume safely" },
    blueprint: { title: "Factory Blueprint", ref: "spec.md", status: "approved" },
    currentPiece: { id: "engine-1", title: "Truth & Workbench", purpose: "Show one truth set" },
    state: "EDITING",
    nextAction: "review-diff",
    blocker: null,
    evidence: [{ kind: "diff", label: "Current diff", value: "abc" }],
  });
  assert.equal(view.mission.summary, "Build Engine 1");
  assert.equal(view.blueprint.ref, "spec.md");
  assert.equal(view.currentPiece.id, "engine-1");
  assert.equal(view.status, "EDITING");
  assert.deepEqual(view.evidence, [{ kind: "diff", label: "Current diff", value: "abc" }]);
  assert.equal(view.next, "review-diff");
  assert.equal(view.blocker, null);
});

test("returns safe empty truth instead of inventing missing workbench state", async () => {
  const { createWorkbenchView } = await load();
  const view = createWorkbenchView({ state: "INSPECTING", nextAction: "inspect", blocker: null });
  assert.equal(view.mission, null);
  assert.equal(view.blueprint, null);
  assert.equal(view.currentPiece, null);
  assert.deepEqual(view.evidence, []);
  assert.equal(view.status, "INSPECTING");
  assert.equal(view.next, "inspect");
});

test("factory stage is authoritative for both status and next action", async () => {
  const { createWorkbenchView } = await load();
  const view = createWorkbenchView({
    state: "EDITING", factoryStage: "READY_GATE", nextAction: "review-diff",
    workPackage: { id: "wp-1" }, piece: { id: "piece-1", headSha: "head-1" },
    pieceQc: { status: "pass", evidenceIds: ["ev-1"] },
    gateHandoff: { status: "READY_FOR_ASSEMBLY", headSha: "head-1" },
  });
  assert.equal(view.status, "READY_GATE");
  assert.equal(view.next, "assemble");
});
