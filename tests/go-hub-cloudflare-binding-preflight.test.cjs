"use strict";
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const workflow = fs.readFileSync(path.resolve(__dirname, "..", ".github", "workflows", "go-hub-deploy.yml"), "utf8");

test("GO Hub deploy preflights Cloudflare Linear bindings without exposing values", () => {
  assert.match(workflow, /Preflight Cloudflare Linear bindings/);
  assert.match(workflow, /workers\/scripts\/go-hub\/settings/);
  assert.match(workflow, /LINEAR_API_KEY/);
  assert.match(workflow, /linear-API/);
  assert.match(workflow, /LINEAR_TEAM_KEY/);
  assert.doesNotMatch(workflow, /LINEAR_TEAM_ID/);
  assert.match(workflow, /secret_text/);
  assert.match(workflow, /plain_text/);
  assert.match(workflow, /Cloudflare binding missing or wrong type/);
  assert.match(workflow, /LINEAR_API_KEY or linear-API/);
  assert.doesNotMatch(workflow, /console\.log\([^\n]*binding\.text/);
});
