"use strict";
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const codeModule = path.join(root, "go-hub-code-module.js");

test("Code module exists as a GO Hub capability", () => {
  assert.equal(fs.existsSync(codeModule), true);
});

test("Code module defines a provider-neutral workspace capability", () => {
  const source = fs.readFileSync(codeModule, "utf8");
  assert.match(source, /createCodeCapability/);
  assert.match(source, /needs-workspace/);
  assert.match(source, /listFiles/);
  assert.match(source, /readText/);
  assert.match(source, /writeText/);
});

test("GO Hub shell registers the Code capability", () => {
  const shell = fs.readFileSync(path.join(root, "go-hub-shell.js"), "utf8");
  assert.match(shell, /go-hub-code-module\.js/);
  assert.match(shell, /runtime\.register\(["']Code["']/);
});


test("Code capability exposes machine-usable workstation lifecycle state", async () => {
  const { pathToFileURL } = require("node:url");
  const { createCodeCapability } = await import(pathToFileURL(codeModule).href);
  const workspace = {
    listFiles() {}, readText() {}, writeText() {}, createBranch() {}, compare() {},
  };
  const task = {
    snapshot() {
      return {
        id: "task-19", state: "CI_RUNNING", nextAction: "check-ci", blocker: null,
        repository: "pureekangraw-ops/standard-", baseBranch: "main", baseSha: "base-1",
        workBranch: "feature-a", headSha: "head-1", pullRequest: { number: 19 }, ci: { conclusion: null },
      };
    },
  };
  const capability = createCodeCapability({ workspace, task });
  assert.equal(capability.status, "ready");
  assert.equal(capability.task.state, "CI_RUNNING");
  assert.equal(capability.nextAction, "check-ci");
  assert.equal(capability.headSha, "head-1");
  assert.equal(capability.pullRequest.number, 19);
});


test("Code task session restores and saves through the injected persistence port", async () => {
  const { pathToFileURL } = require("node:url");
  const { createCodeTaskSession } = await import(pathToFileURL(codeModule).href);
  let stored = {
    id: "resume-1", intent: "continue", repository: "pureekangraw-ops/standard-",
    state: "CI_RUNNING", nextAction: "check-ci", baseBranch: "main", baseSha: "base-1",
    workBranch: "feature-a", headSha: "head-1", touchedPaths: [], diffFingerprint: null,
    blocker: null, pullRequest: { number: 19, headSha: "head-1" },
    ci: { headSha: "head-1" }, merge: null, deployment: null, verification: null,
    rollback: null, audit: [],
  };
  const persistence = {
    async loadState() { return structuredClone(stored); },
    async commitState({ proposed }) { stored = structuredClone(proposed); return { status: "COMMITTED" }; },
  };
  const session = createCodeTaskSession({ persistence });
  let task = await session.load();
  assert.equal(task.state, "CI_RUNNING");
  task = task.appendAudit("SPECIALIST_RETURN", { result: "green" });
  assert.equal((await session.save(task)).status, "COMMITTED");
  assert.equal(stored.audit[0].event, "SPECIALIST_RETURN");
});
