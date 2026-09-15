"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("deployment publishes MCP and OAuth routes and checks every module", () => {
  const wrangler = JSON.parse(fs.readFileSync(path.join(root, "wrangler.go-hub.jsonc"), "utf8"));
  assert.deepEqual(wrangler.assets.run_worker_first, [
    "/hub/api/github-workspace/*",
    "/mcp",
    "/oauth/*",
    "/.well-known/*",
  ]);
  assert.equal(wrangler.durable_objects.bindings[0].name, "GO_HUB_FACTORY_STATE");
  assert.equal(wrangler.durable_objects.bindings[0].class_name, "GoHubFactoryState");
  assert.equal(wrangler.exports.GoHubFactoryState.type, "durable-object");
  assert.equal(wrangler.exports.GoHubFactoryState.storage, "sqlite");

  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  for (const file of [
    "go-hub-oauth.mjs",
    "go-hub-mcp-registry.mjs",
    "go-hub-mcp.mjs",
    "go-hub-factory-state-core.mjs",
    "go-hub-factory-state.mjs",
    "go-hub-worker.mjs",
  ]) {
    assert.match(packageJson.scripts["check:syntax"], new RegExp(file.replaceAll(".", "\\.")));
  }

  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "go-hub-deploy.yml"), "utf8");
  for (const secret of [
    "GOHUB_MASTER_KEY",
    "GOHUB_OWNER_PASSCODE",
  ]) assert.match(workflow, new RegExp(secret));
  assert.match(workflow, /chmod 600/);
});
