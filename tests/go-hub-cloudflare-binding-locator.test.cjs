"use strict";
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const workflow = fs.readFileSync(path.resolve(__dirname, "..", ".github", "workflows", "go-hub-deploy.yml"), "utf8");

test("Cloudflare preflight locates misplaced Linear bindings without exposing values", () => {
  assert.match(workflow, /Locate misplaced Linear bindings/);
  assert.match(workflow, /accounts\/\$\{CLOUDFLARE_ACCOUNT_ID\}\/workers\/scripts/);
  assert.match(workflow, /candidate Worker/);
  assert.match(workflow, /LINEAR_API_KEY/);
  assert.match(workflow, /LINEAR_TEAM_ID/);
  assert.match(workflow, /binding\.name/);
  assert.match(workflow, /binding\.type/);
  assert.doesNotMatch(workflow, /binding\.text/);
});
