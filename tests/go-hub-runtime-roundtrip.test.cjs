"use strict";
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const shell = fs.readFileSync(path.join(root, "go-hub-shell.js"), "utf8");

test("active shell binds Factory work context and returns real Factory reality", () => {
  assert.match(shell, /createFactoryWorkContext/);
  assert.match(shell, /createFactoryRealityReturn/);
  assert.match(shell, /workContext/);
  assert.equal(shell.includes("returned-by-operator"), false);
});
