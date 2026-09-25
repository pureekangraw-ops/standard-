"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "go-hub-factory-mcp-worker.mjs"), "utf8");

test("LIGHT may open its own governed Factory gate without gaining merge/delete authority", () => {
  const start = source.indexOf("const LIGHT_MUTATION_TOOL_NAMES");
  const end = source.indexOf("const LIGHT_DIRECT_TOOL_NAMES", start);
  assert.ok(start >= 0 && end > start, "LIGHT mutation allowlist must exist");
  const allowlist = source.slice(start, end);

  assert.match(allowlist, /"go_hub_heimdall_pass"/);
  assert.match(allowlist, /"go_hub_factory_v4"/);
  assert.doesNotMatch(allowlist, /"go_hub_merge_pull_request"/);
  assert.doesNotMatch(allowlist, /"go_hub_delete_file"/);
  assert.doesNotMatch(allowlist, /"go_hub_maintenance"/);
  assert.doesNotMatch(allowlist, /"go_hub_centre_live_action"/);
});

test("LIGHT Factory mutations still route through holder, Centre and Factory V4 enforcement", () => {
  assert.match(source, /actor:lightMcp \? "LIGHT" : "GO"/);
  assert.match(source, /runMutation\("factory\.v4\."/);
  assert.match(source, /FACTORY_V4_CENTRE_IDENTITY_MISMATCH/);
});
