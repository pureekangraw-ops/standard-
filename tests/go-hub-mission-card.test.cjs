"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "go-hub-mission-card.mjs")).href;

function cardInput() {
  return {
    workId: "WORK-MISSION-1",
    checkpointId: "CP-MISSION-1",
    jobCode: "JOB-1",
    status: "THIS MUST NOT BE COPIED",
    phase: "THIS MUST NOT BE COPIED",
  };
}

test("Mission Card is a pointer and never carries owner truth", async () => {
  const { createMissionCard } = await import(moduleUrl);
  const card = createMissionCard(cardInput());
  assert.deepEqual(card.workId, "WORK-MISSION-1");
  assert.deepEqual(card.checkpointId, "CP-MISSION-1");
  assert.equal("status" in card, false);
  assert.equal("phase" in card, false);
});

test("Card Counter resolves fresh owner source and projects read-only observations", async () => {
  const { createMissionCard, createCardCounter } = await import(moduleUrl + "?counter=" + Date.now());
  const card = createMissionCard(cardInput());
  const calls = [];
  const counter = createCardCounter({
    resolveWork: async context => {
      calls.push(context);
      return { status: "ON PROCESS", ownerSource: "Centre", sourceRef: "centre://work/1" };
    },
    projections: [
      { source: "CENTRE", read: async ({ fresh }) => ({ status: fresh ? "LIVE" : "UNKNOWN", ownerSource: "Centre", data: { phase: "ON PROCESS" }, sourceRef: "centre://work/1" }) },
      { source: "BOARD", read: async () => ({ status: "LIVE", ownerSource: "Central Board", data: { phase: "DOING" }, sourceRef: "board://work/1" }) },
    ],
  });
  const projection = await counter.tap(card, { lens: "factory" });
  assert.equal(calls[0].fresh, true);
  assert.equal(projection.mutates, false);
  assert.equal(projection.lens, "factory");
  assert.deepEqual(projection.observations.map(item => item.source), ["CENTRE", "BOARD"]);
  assert.equal(projection.card.status, undefined);
});

test("Dressing brief survives missing LIGHT and preserves UNKNOWN", async () => {
  const { createMissionCard, createCardCounter, composeDressingBrief } = await import(moduleUrl + "?brief=" + Date.now());
  const card = createMissionCard(cardInput());
  const counter = createCardCounter({
    resolveWork: async () => ({ status: "ON PROCESS" }),
    projections: [
      { source: "CENTRE", read: async () => ({ status: "LIVE", ownerSource: "Centre", data: { status: "ON PROCESS" }, sourceRef: "centre://1" }) },
      { source: "GITHUB", read: async () => { throw new Error("github unavailable"); } },
    ],
  });
  const projection = await counter.tap(card);
  const brief = composeDressingBrief({ counterProjection: projection });
  assert.equal(brief.light.status, "UNAVAILABLE");
  assert.equal(brief.mutates, false);
  assert.equal(brief.observations.find(item => item.source === "GITHUB").status, "UNKNOWN");
  assert.equal(brief.observations.find(item => item.source === "CENTRE").ownerSource, "Centre");
});

test("1:1 crosscheck and doubt engine emit observations, not verdicts", async () => {
  const { compareOneToOne, createDoubtEngine } = await import(moduleUrl + "?compare=" + Date.now());
  const result = compareOneToOne({
    topic: "Centre status ↔ Board status",
    left: { status: "LIVE", data: "OPEN", ownerSource: "Centre" },
    right: { status: "LIVE", data: "COMPLETE", ownerSource: "Central Board" },
  });
  assert.equal(result.status, "DIFFERENT");
  assert.equal("verdict" in result, false);
  assert.equal(createDoubtEngine([result])[0].label, "WORTH CHECKING");
});

test("Re-brief exposes only changed observations as SINCE LAST BRIEF", async () => {
  const { compareBriefs } = await import(moduleUrl + "?rebrief=" + Date.now());
  const previous = { observations: [{ source: "CENTRE", status: "LIVE", data: { phase: "OPEN" } }] };
  const current = { observations: [{ source: "CENTRE", status: "LIVE", data: { phase: "COMPLETE" } }] };
  const changes = compareBriefs(previous, current);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].label, "SINCE LAST BRIEF");
  assert.equal(changes[0].status, "CHANGED");
});
