"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("controller dispatches business commands through workflow authority", () => {
  const source = read("controller.js");
  assert.match(source, /createWorkflowCoordinator/);
  assert.match(source, /coordinator\.execute\(currentState, authorizedCommand/);
  assert.doesNotMatch(source, /const proposed = applyCommand\(currentState, command/);
});

test("controller supplies legacy owner only at its compatibility boundary", () => {
  const source = read("controller.js");
  assert.match(source, /owner:\s*command\.owner\s*\|\|\s*legacyOwnerFor\(command\.type\)/);
  assert.match(source, /STORE_PURCHASE/);
  assert.match(source, /LEDGER_OBLIGATION_ADD/);
  assert.match(source, /CALENDAR_COMPLETE/);
});
