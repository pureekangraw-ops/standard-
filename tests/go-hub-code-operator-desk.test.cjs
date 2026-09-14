"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("Code operator desk exposes resumable machine-useful task evidence", () => {
  const html = read("go-hub.html");
  for (const marker of [
    "data-code-operator",
    "data-code-state",
    "data-code-repository",
    "data-code-base",
    "data-code-work-branch",
    "data-code-head",
    "data-code-pr",
    "data-code-ci",
    "data-code-deploy",
    "data-code-verification",
    "data-code-blocker",
    "data-code-next-action",
  ]) {
    assert.match(html, new RegExp(marker), marker + " must be present");
  }
});

test("Code operator desk can inspect GitHub truth and durably advance the task", () => {
  const html = read("go-hub.html");
  const shell = read("go-hub-shell.js");
  assert.match(html, /data-code-inspect/);
  assert.match(shell, /workspace\.inspect\(\)/);
  assert.match(shell, /task\.transition\("BRANCH_READY"/);
  assert.match(shell, /session\.save\(task\)/);
  assert.match(shell, /refreshCodeCapability/);
  assert.match(shell, /INSPECT_FAILED/);
});

test("Code operator desk reports failures without inventing lifecycle progress", () => {
  const shell = read("go-hub-shell.js");
  assert.match(shell, /data-code-error/);
  assert.match(shell, /task\.appendAudit\("INSPECT_FAILED"/);
  assert.match(shell, /button\.disabled = true/);
  assert.match(shell, /finally/);
});
