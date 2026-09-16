"use strict";
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "go-hub-deploy.yml"), "utf8");
const wrangler = JSON.parse(fs.readFileSync(path.join(root, "wrangler.go-hub.jsonc"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("Cloudflare is the runtime source of truth for Linear configuration", () => {
  assert.equal(wrangler.keep_vars, true, "dashboard vars such as LINEAR_TEAM_ID must survive Wrangler deploys");
  assert.deepEqual(wrangler.secrets?.required, ["LINEAR_API_KEY"], "deploy must require the Cloudflare Linear secret");
  assert.doesNotMatch(workflow, /secrets\.LINEAR_API_KEY/);
  assert.doesNotMatch(workflow, /vars\.LINEAR_TEAM_ID/);
  assert.doesNotMatch(workflow, /printf 'LINEAR_API_KEY=/);
  assert.doesNotMatch(workflow, /printf 'LINEAR_TEAM_ID=/);
  assert.doesNotMatch(workflow, /Linear bridge runtime configuration is incomplete/);
});

test("deploy syntax gate includes the Linear service module", () => {
  assert.match(pkg.scripts["check:syntax"], /go-hub-linear-service\.mjs/);
});
