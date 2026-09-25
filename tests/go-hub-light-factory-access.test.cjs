"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const worker = fs.readFileSync(path.join(root, "go-hub-factory-mcp-worker.mjs"), "utf8");
const registry = fs.readFileSync(path.join(root, "go-hub-mcp-registry.mjs"), "utf8");

test("LIGHT gets bounded Factory aliases without generic Heimdall/Factory/merge authority", () => {
  const start = worker.indexOf("const LIGHT_MUTATION_TOOL_NAMES");
  const end = worker.indexOf("const LIGHT_DIRECT_TOOL_NAMES", start);
  assert.ok(start >= 0 && end > start, "LIGHT mutation allowlist must exist");
  const allowlist = worker.slice(start, end);

  assert.match(allowlist, /"go_hub_light_centre_v4_action"/);
  assert.match(allowlist, /"go_hub_light_factory_v4_action"/);
  assert.doesNotMatch(allowlist, /"go_hub_heimdall_pass"/);
  assert.doesNotMatch(allowlist, /"go_hub_factory_v4"/);
  assert.doesNotMatch(allowlist, /"go_hub_merge_pull_request"/);
  assert.doesNotMatch(allowlist, /"go_hub_delete_file"/);
  assert.doesNotMatch(allowlist, /"go_hub_maintenance"/);
});

test("LIGHT Factory aliases remain holder, Pass and Centre-bound", () => {
  assert.match(registry, /go_hub_light_factory_v4_action/);
  assert.match(registry, /v4_open_pass/);
  assert.match(worker, /work\.holder !== "LIGHT"/);
  assert.match(worker, /LIGHT_FACTORY_PASS_REQUIRED/);
  assert.match(worker, /destinations = \["factory"\]/);
  assert.match(worker, /runMutation\("factory\.v4\.light\."/);
});
