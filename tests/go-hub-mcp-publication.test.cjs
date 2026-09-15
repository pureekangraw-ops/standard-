"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("deployment publishes Browser, Factory MCP, OAuth, deployment reality, and durable Hephaestus", () => {
  const wrangler = JSON.parse(fs.readFileSync(path.join(root, "wrangler.go-hub.jsonc"), "utf8"));
  assert.deepEqual(wrangler.assets.run_worker_first, [
    "/hub/api/version",
    "/hub/api/browser/*",
    "/hub/api/github-workspace/*",
    "/mcp",
    "/oauth/*",
    "/.well-known/*",
  ]);
  assert.deepEqual(wrangler.durable_objects?.bindings, [
    { name: "HEPHAESTUS", class_name: "HephaestusForeman" },
  ]);
  assert.ok(wrangler.migrations?.some(item =>
    Array.isArray(item.new_sqlite_classes) && item.new_sqlite_classes.includes("HephaestusForeman")));

  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  for (const file of [
    "go-hub-browser-interface.js",
    "go-hub-edge-worker.mjs",
    "go-hub-factory-controller.mjs",
    "go-hub-factory-mcp-worker.mjs",
    "go-hub-hephaestus.js",
    "go-hub-hephaestus-queue.js",
    "go-hub-hephaestus-return.js",
    "go-hub-oauth.mjs",
    "go-hub-mcp-registry.mjs",
    "go-hub-mcp.mjs",
    "go-hub-worker.mjs",
  ]) {
    assert.match(packageJson.scripts["check:syntax"], new RegExp(file.replaceAll(".", "\\.")));
  }

  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "go-hub-deploy.yml"), "utf8");
  for (const secret of [
    "GOHUB_MASTER_KEY",
    "GOHUB_OWNER_PASSCODE",
  ]) assert.match(workflow, new RegExp(secret));
  assert.match(workflow, /GOHUB_DEPLOY_SHA/);
  assert.match(workflow, /Post-deploy smoke/);
  assert.match(workflow, /chmod 600/);
});
