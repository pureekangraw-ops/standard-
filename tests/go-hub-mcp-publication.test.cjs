"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("deployment publishes Browser, Factory MCP, OAuth, and durable Hephaestus", () => {
  const wrangler = JSON.parse(fs.readFileSync(path.join(root, "wrangler.go-hub.jsonc"), "utf8"));
  assert.deepEqual(wrangler.assets.run_worker_first, [
    "/hub/api/browser/*",
    "/hub/api/github-workspace/*",
    "/mcp",
    "/oauth/*",
    "/.well-known/*",
  ]);
  assert.deepEqual(wrangler.durable_objects?.bindings, [
    { name: "HEPHAESTUS", class_name: "HephaestusForeman" },
    { name: "GO_HUB_FACTORY_STATE", class_name: "GoHubFactoryState" },
  ]);
  assert.ok(wrangler.migrations?.some(item =>
    Array.isArray(item.new_sqlite_classes) && item.new_sqlite_classes.includes("HephaestusForeman")));
  assert.ok(wrangler.migrations?.some(item =>
    Array.isArray(item.new_sqlite_classes) && item.new_sqlite_classes.includes("GoHubFactoryState")));

  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  for (const file of [
    "go-hub-browser-interface.js",
    "go-hub-edge-worker.mjs",
    "go-hub-factory-controller.mjs",
    "go-hub-factory-task-controller.mjs",
    "go-hub-factory-service.mjs",
    "go-hub-factory-state-core.mjs",
    "go-hub-factory-state.mjs",
    "go-hub-reality-receipt.mjs",
    "go-hub-maintenance.js",
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
  assert.match(workflow, /chmod 600/);
});
