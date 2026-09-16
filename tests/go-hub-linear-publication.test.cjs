"use strict";
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "go-hub-deploy.yml"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("GO Hub deploy publishes Linear bridge runtime configuration without committing values", () => {
  assert.match(workflow, /LINEAR_API_KEY:\s*\$\{\{\s*secrets\.LINEAR_API_KEY\s*\}\}/);
  assert.match(workflow, /LINEAR_TEAM_ID:\s*\$\{\{\s*vars\.LINEAR_TEAM_ID\s*\}\}/);
  assert.match(workflow, /printf 'LINEAR_API_KEY=%s\\n'/);
  assert.match(workflow, /printf 'LINEAR_TEAM_ID=%s\\n'/);
  assert.match(workflow, /Linear bridge runtime configuration is incomplete/);
  assert.match(workflow, /exit 1/);
  assert.doesNotMatch(workflow, /LINEAR_API_KEY:\s*[A-Za-z0-9_-]{20,}/);
});

test("deploy syntax gate includes the Linear service module", () => {
  assert.match(pkg.scripts["check:syntax"], /go-hub-linear-service\.mjs/);
});
