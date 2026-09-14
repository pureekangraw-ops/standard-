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
