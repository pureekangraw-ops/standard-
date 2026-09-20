"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const url = pathToFileURL(path.resolve(__dirname, "../go-hub-lean-flow.js")).href;

function base(overrides = {}) {
  return {
    packageId: "PKG-1",
    workId: "WORK-1",
    source: "centre",
    destination: "destination://factory",
    payload: { task: "redesign" },
    ...overrides,
  };
}

function plan() {
  return {
    scope: "lean flow",
    reality: "legacy ceremony-heavy flow",
    repository: "pureekangraw-ops/standard-",
    branch: "feat/go-hub-lean-flow-20260920",
    architecture: "Centre identity; Factory planning",
    dependencies: ["node"],
    constraints: ["preserve existing routes"],
    existingImplementation: "legacy lifecycle",
    changes: "add package flow",
    impact: "factory and centre",
    steps: ["find repo", "plan", "execute", "verify", "deliver"],
    testStrategy: ["contract tests"],
    buildStrategy: ["npm test"],
    acceptanceCriteria: ["package identity preserved"],
    deliverables: ["code", "tests"],
  };
}

test("package identity survives the whole receive to send flow", async () => {
  const m = await import(url + "?flow=" + Date.now());
  let pkg = m.receivePackage(base(), "WORK-1");
  pkg = m.findRepository(pkg, { repository: "pureekangraw-ops/standard-" });
  pkg = m.lockPlan(pkg, plan());
  pkg = m.executePlan(pkg, { commit: "abc123" });
  pkg = m.verifyPlan(pkg, {
    planMatched: true,
    testsPassed: true,
    buildPassed: true,
    acceptanceCriteria: ["package identity preserved"],
    deliverables: ["code", "tests"],
  });
  pkg = m.deliverPackage(pkg, { commit: "abc123", tests: "green" });
  const sent = m.sendPackage(pkg, "destination://centre");
  assert.equal(sent.packageId, "PKG-1");
  assert.equal(sent.workId, "WORK-1");
  assert.equal(sent.currentState, m.FLOW_STATES.SENT);
});

test("planning is the only heavy gate and execution requires Plan Lock", async () => {
  const m = await import(url + "?flow=" + Math.random());
  const received = m.receivePackage(base(), "WORK-1");
  assert.throws(() => m.executePlan(received, {}), /PLAN_LOCK/);
  const repo = m.findRepository(received, { repository: "pureekangraw-ops/standard-" });
  assert.throws(() => m.lockPlan(repo, { ...plan(), buildStrategy: [] }), /non-empty/);
  const locked = m.lockPlan(repo, plan());
  assert.equal(locked.currentState, m.FLOW_STATES.PLAN_LOCKED);
});

test("READ ONLY and BIG DIRECT bypass Factory without losing identity", async () => {
  const m = await import(url + "?flow=" + Math.random());
  const read = m.readOnly(base({ destination: "destination://browser" }));
  const direct = m.bigDirect(base({ destination: "destination://factory" }));
  assert.equal(read.workId, "WORK-1");
  assert.equal(read.currentState, m.FLOW_STATES.SENT);
  assert.equal(direct.packageId, "PKG-1");
  assert.equal(direct.currentState, m.FLOW_STATES.SENT);
});

test("mismatched Work ID stops at Centre receive", async () => {
  const m = await import(url + "?flow=" + Math.random());
  assert.throws(() => m.receivePackage(base(), "WORK-OTHER"), /WORK_ID_MISMATCH/);
});
