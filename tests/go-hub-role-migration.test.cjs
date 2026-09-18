"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("Centre active runtime is Role-only with no legacy Lens fallback", () => {
  const forbidden = [
    ["go-hub-centre.js", /fitLens|\blens\b|lensReference|lensId|fittedView/],
    ["go-hub-shell.js", /centreWork\.lens|\.fittedView/],
    ["go-hub-optician.js", /lensReference|\blens\s*=|lens\.reference/],
  ];
  for (const [file, pattern] of forbidden) {
    assert.doesNotMatch(read(file), pattern, file + " must not retain legacy Lens fallback");
  }
});

test("Centre live rejects legacy Lens input instead of using it as fallback", () => {
  const source = read("go-hub-centre-live.mjs");
  assert.match(source, /LEGACY_LENS_CONTRACT_REJECTED/);
  assert.match(source, /input\.lensId/);
  assert.doesNotMatch(source, /roleReference\s*=\s*input\.roleReference\s*\?\?\s*input\.lensReference/);
});

test("Centre MCP fit schema publishes Role fields and no Lens fields", () => {
  const source = read("go-hub-mcp-registry.mjs");
  const line = source.split("\n").find(value => value.includes('def("go_hub_centre_live_action"'));
  assert.ok(line);
  assert.match(line, /roleId/);
  assert.match(line, /roleReference/);
  assert.match(line, /workingView/);
  assert.doesNotMatch(line, /lensId|lensReference|fittedView/);
});

test("Centre-focused tests no longer construct Lens fits", () => {
  for (const file of [
    "tests/go-hub-centre.test.cjs",
    "tests/go-hub-centre-roundtrip.test.cjs",
  ]) {
    assert.doesNotMatch(read(file), /fitLens|lensId|lensReference|fittedView|\.lens\b/, file + " must test Role contract only");
  }
});
